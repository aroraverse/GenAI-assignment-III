import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NotebookLM RAG | Shubh",
  description: "Upload a document, ask grounded questions, and review cited answers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
