# GenAI-assignment-III

# NotebookLM RAG

This project is a document question-answering app. You upload a PDF or plain text file, the app splits the file into chunks, creates embeddings with Google Gemini, stores them in Qdrant, and then answers follow-up questions using only the retrieved document context.

## What it does

- Upload PDF or `.txt` files from the browser.
- Index the document into a fresh Qdrant collection per upload.
- Ask questions in a chat-style interface.
- Return answers grounded in the document, with source snippets and page references when available.

## How it works

```
   ┌─────────────┐
   │  Upload PDF │
   │  or .txt    │
   └──────┬──────┘
          ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ 1. Load doc  │ →  │ 2. Chunk     │ →  │ 3. Embed     │
  │ (PDFLoader / │    │ (Recursive   │    │ (Gemini      │
  │  text)       │    │  splitter)   │    │  embed-001)  │
  └──────────────┘    └──────────────┘    └──────┬───────┘
                                                 ▼
                                          ┌──────────────┐
                                          │ 4. Store in  │
                                          │   Qdrant     │
                                          └──────────────┘

  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │  Question   │ →  │ Embed query  │ →  │ Retrieve     │ →  │ Gemini 2.5   │
  │             │    │              │    │ top-k chunks │    │ flash answers│
  └─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                              (grounded only
                                                               in retrieved
                                                               context)
```

## Stack

| Layer         | Choice                                  |
| ------------- | --------------------------------------- |
| Framework     | Next.js 14 (App Router) + TypeScript    |
| LLM           | Google Gemini `gemini-2.5-flash`        |
| Embeddings    | Google `gemini-embedding-001`           |
| Vector DB     | Qdrant Cloud                            |
| Orchestration | LangChain JS                            |
| Hosting       | Vercel                                  |

## Example

<img width="1470" height="956" alt="example" src="https://github.com/aroraverse/GenAI-assignment-III/blob/main/image.png" />

