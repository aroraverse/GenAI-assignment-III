import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { CHAT_MODEL, getEmbeddings, getQdrantConfig } from "@/lib/rag";

export type RetrievedChunk = {
  index: number;
  pageNumber: number | null;
  content: string;
};

export type CorrectiveDecision = {
  relevantChunkIndices: number[];
  shouldRewrite: boolean;
  rewrittenQuestion: string | null;
  notes: string;
};

export type CorrectiveAnswer = {
  answer: string;
  sources: Array<{
    pageNumber: number | null;
    snippet: string;
  }>;
  correctedQuestion: string;
  diagnostics: {
    initialCandidates: number;
    finalCandidates: number;
    rewroteQuery: boolean;
  };
};

const INITIAL_RETRIEVAL_K = 6;
const MAX_CONTEXT_CHUNKS = 4;

function getResponseText(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  return trimmed;
}

function parseDecision(raw: string): CorrectiveDecision {
  const payload = JSON.parse(extractJsonPayload(raw)) as Partial<CorrectiveDecision>;

  return {
    relevantChunkIndices: Array.isArray(payload.relevantChunkIndices)
      ? payload.relevantChunkIndices.filter((value): value is number =>
          Number.isInteger(value),
        )
      : [],
    shouldRewrite: Boolean(payload.shouldRewrite),
    rewrittenQuestion:
      typeof payload.rewrittenQuestion === "string" &&
      payload.rewrittenQuestion.trim().length > 0
        ? payload.rewrittenQuestion.trim()
        : null,
    notes: typeof payload.notes === "string" ? payload.notes : "",
  };
}

async function retrieveChunks(docId: string, question: string, k = INITIAL_RETRIEVAL_K) {
  const store = await QdrantVectorStore.fromExistingCollection(getEmbeddings(), {
    ...getQdrantConfig(),
    collectionName: docId,
  });

  const retriever = store.asRetriever({ k });
  const docs = await retriever.invoke(question);

  return docs.map<RetrievedChunk>((doc, index) => ({
    index: index + 1,
    pageNumber:
      (doc.metadata?.loc as { pageNumber?: number } | undefined)?.pageNumber ??
      (doc.metadata?.page as number | undefined) ??
      null,
    content: doc.pageContent,
  }));
}

async function gradeChunks(question: string, chunks: RetrievedChunk[]): Promise<CorrectiveDecision> {
  const llm = new ChatGoogleGenerativeAI({
    model: CHAT_MODEL,
    temperature: 0,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const response = await llm.invoke([
    {
      role: "system",
      content:
        "You are a corrective RAG relevance grader. Return valid JSON only with keys relevantChunkIndices, shouldRewrite, rewrittenQuestion, and notes. relevantChunkIndices must contain 1-based chunk indices that directly help answer the question. If the chunks are weak, noisy, or irrelevant, set relevantChunkIndices to [] and shouldRewrite to true. If shouldRewrite is true, rewrittenQuestion should be a short improved retrieval query that preserves the user's intent.",
    },
    {
      role: "user",
      content: JSON.stringify({ question, chunks }, null, 2),
    },
  ]);

  return parseDecision(getResponseText(response.content));
}

function selectChunks(chunks: RetrievedChunk[], indices: number[]): RetrievedChunk[] {
  const selected = indices
    .map((index) => chunks.find((chunk) => chunk.index === index))
    .filter((chunk): chunk is RetrievedChunk => Boolean(chunk));

  return selected.slice(0, MAX_CONTEXT_CHUNKS);
}

async function answerFromContext(question: string, chunks: RetrievedChunk[]) {
  const llm = new ChatGoogleGenerativeAI({
    model: CHAT_MODEL,
    temperature: 0,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const context = chunks.map((chunk) => ({
    index: chunk.index,
    pageNumber: chunk.pageNumber,
    content: chunk.content,
  }));

  const systemPrompt = `You are an AI assistant that answers questions using ONLY the provided context from a single document.

Rules:
- Use only the context. Do not add outside knowledge.
- If the answer cannot be supported by the context, reply exactly: "I couldn't find this in the document."
- Cite pages inline like "(page 3)" when page numbers are available.
- Be concise and direct.

Context (JSON array of chunks):
${JSON.stringify(context, null, 2)}`;

  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ]);

  return getResponseText(response.content);
}

export async function runCorrectiveRag(docId: string, question: string): Promise<CorrectiveAnswer> {
  const initialChunks = await retrieveChunks(docId, question);
  const initialDecision = await gradeChunks(question, initialChunks);

  let correctedQuestion = question;
  let selectedChunks = selectChunks(initialChunks, initialDecision.relevantChunkIndices);
  let rewroteQuery = false;

  if (selectedChunks.length === 0 && initialDecision.shouldRewrite && initialDecision.rewrittenQuestion) {
    correctedQuestion = initialDecision.rewrittenQuestion;
    rewroteQuery = true;

    const correctedChunks = await retrieveChunks(docId, correctedQuestion);
    const correctedDecision = await gradeChunks(correctedQuestion, correctedChunks);
    selectedChunks = selectChunks(correctedChunks, correctedDecision.relevantChunkIndices);

    if (selectedChunks.length > 0) {
      correctedQuestion = correctedDecision.rewrittenQuestion ?? correctedQuestion;
    }
  }

  if (selectedChunks.length === 0) {
    return {
      answer: "I couldn't find this in the document.",
      sources: [],
      correctedQuestion,
      diagnostics: {
        initialCandidates: initialChunks.length,
        finalCandidates: 0,
        rewroteQuery,
      },
    };
  }

  const answer = await answerFromContext(correctedQuestion, selectedChunks);

  return {
    answer,
    sources: selectedChunks.map((chunk) => ({
      pageNumber: chunk.pageNumber,
      snippet: chunk.content.slice(0, 240),
    })),
    correctedQuestion,
    diagnostics: {
      initialCandidates: initialChunks.length,
      finalCandidates: selectedChunks.length,
      rewroteQuery,
    },
  };
}