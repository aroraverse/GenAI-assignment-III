"use client";

import { useRef, useState } from "react";

const workflow = [
  "Upload a PDF or .txt file",
  "Chunk and embed the content in Qdrant",
  "Ask questions grounded in the source",
];

const featureBadges = ["PDF + text", "Grounded answers", "Citations included"];

type Source = {
  pageNumber: number | null;
  snippet: string;
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources?: Source[] };

export default function Home() {
  const [docId, setDocId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setMessages([]);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDocId(data.docId);
      setFilename(data.filename);
      setChunkCount(data.chunkCount);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || !docId || asking) return;

    setMessages((m) => [...m, { role: "user", content: q }]);
    setQuestion("");
    setAsking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setAsking(false);
    }
  }

  function reset() {
    setDocId(null);
    setFilename(null);
    setChunkCount(null);
    setMessages([]);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">NotebookLM RAG</p>
          <h1>Upload a document. Ask sharper questions.</h1>
          <p className="subtitle hero-subtitle">
            A cleaner workspace for PDF and text Q&A with Gemini and Qdrant,
            tuned to keep the focus on the source material.
          </p>
          <div className="hero-badges" aria-label="Key capabilities">
            {featureBadges.map((badge) => (
              <span key={badge} className="badge">
                {badge}
              </span>
            ))}
          </div>
        </div>

        <aside className="hero-panel">
          <div className="panel-topline">
            <span className="panel-kicker">Workflow</span>
            <span className="panel-status">Live</span>
          </div>
          <ol className="workflow-list">
            {workflow.map((step, index) => (
              <li key={step}>
                <span className="workflow-step">0{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="workspace-grid">
        <section className="panel panel-upload">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">01. Upload</p>
              <h2>Index your document</h2>
            </div>
            <p className="panel-copy">
              PDF and .txt files are split into chunks, embedded, and stored in
              Qdrant.
            </p>
          </div>

          <div className="card">
            {!docId ? (
              <form onSubmit={handleUpload} className="upload-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  disabled={uploading}
                />
                <button type="submit" disabled={uploading}>
                  {uploading ? "Indexing…" : "Upload"}
                </button>
              </form>
            ) : (
              <div className="upload-row upload-row--active">
                <span className="doc-pill">
                  <strong>{filename}</strong>
                  <span>· {chunkCount} chunks</span>
                </span>
                <button onClick={reset} type="button">
                  New document
                </button>
              </div>
            )}
            {uploadError && <p className="status error">{uploadError}</p>}
            {uploading && <p className="status">Chunking, embedding, indexing…</p>}
          </div>
        </section>

        <section className="panel panel-chat">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">02. Ask</p>
              <h2>Chat with the document</h2>
            </div>
            <p className="panel-copy">
              Answers stay grounded in the uploaded source and surface citations
              when available.
            </p>
          </div>

          {!docId ? (
            <div className="card empty-state">
              <p className="empty-title">Ready when you are.</p>
              <p className="empty-copy">
                Upload a document to unlock the chat, then ask for summaries,
                quotes, or page-specific details.
              </p>
            </div>
          ) : (
            <section className="chat">
              <div className="messages">
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    <div>{m.content}</div>
                    {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                      <div className="sources">
                        <details>
                          <summary>Sources ({m.sources.length})</summary>
                          {m.sources.map((s, j) => (
                            <div key={j} className="source-item">
                              {s.pageNumber !== null && (
                                <div className="pg">Page {s.pageNumber}</div>
                              )}
                              <div>{s.snippet}…</div>
                            </div>
                          ))}
                        </details>
                      </div>
                    )}
                  </div>
                ))}
                {asking && <div className="thinking">Thinking…</div>}
              </div>

              <form onSubmit={handleAsk} className="input-row">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk(e);
                    }
                  }}
                  placeholder="Ask a question about the document…"
                  disabled={asking}
                />
                <button type="submit" disabled={asking || !question.trim()}>
                  Send
                </button>
              </form>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
