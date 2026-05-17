import { NextRequest, NextResponse } from "next/server";
import { runCorrectiveRag } from "@/lib/corrective-rag";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { docId, question } = (await req.json()) as {
      docId?: string;
      question?: string;
    };

    if (!docId || !question?.trim()) {
      return NextResponse.json(
        { error: "docId and question are required" },
        { status: 400 },
      );
    }

    const result = await runCorrectiveRag(docId, question);

    return NextResponse.json({
      answer: result.answer,
      sources: result.sources,
      correctedQuestion: result.correctedQuestion,
      diagnostics: result.diagnostics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    console.error("[chat]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
