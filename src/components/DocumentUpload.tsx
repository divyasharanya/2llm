"use client";

import { useRef, useState, useCallback } from "react";

export interface RagChunk {
  chunkId: string;
  text: string;
  score: number;
}

interface Props {
  label: string;
  onDocumentReady: (documentId: string, fileName: string, chunkCount: number) => void;
  onClear: () => void;
  disabled?: boolean;
}

type UploadStep =
  | { kind: "idle" }
  | { kind: "uploading"; step: string; progress?: number; total?: number }
  | { kind: "ready"; fileName: string; chunkCount: number; documentId: string }
  | { kind: "error"; message: string };

const ACCEPT = ".pdf,.txt,.docx";

export default function DocumentUpload({ label, onDocumentReady, onClear, disabled }: Props) {
  const [state, setState] = useState<UploadStep>({ kind: "idle" });
  const [ragEnabled, setRagEnabled] = useState(true);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setState({ kind: "idle" });
    setRagEnabled(true);
    onClear();
    if (inputRef.current) inputRef.current.value = "";
  };

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "txt", "docx"].includes(ext ?? "")) {
        setState({ kind: "error", message: "Only .pdf, .txt, and .docx files are supported." });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setState({ kind: "error", message: "File too large. Maximum size is 10 MB." });
        return;
      }

      setState({ kind: "uploading", step: "📄 Extracting text from document..." });

      const formData = new FormData();
      formData.append("file", file);

      try {
        setState({ kind: "uploading", step: "✂️ Chunking and indexing..." });

        const res = await fetch("/api/rag/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setState({ kind: "error", message: data.error ?? "Upload failed." });
          return;
        }

        setState({
          kind: "ready",
          fileName: data.fileName,
          chunkCount: data.chunkCount,
          documentId: data.documentId,
        });
        onDocumentReady(data.documentId, data.fileName, data.chunkCount);
      } catch (err: any) {
        setState({ kind: "error", message: err.message ?? "Upload failed." });
      }
    },
    [onDocumentReady]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const isReady = state.kind === "ready";
  const isLoading = state.kind === "uploading";

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <span>📚</span> {label}
          <span className="font-normal text-gray-600 normal-case tracking-normal">(optional)</span>
        </h3>
        {isReady && (
          <button
            onClick={reset}
            className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {/* Drop zone */}
      {!isReady && !isLoading && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl px-5 py-6 flex flex-col items-center gap-2 cursor-pointer transition-all ${
            dragging
              ? "border-purple-500/70 bg-purple-500/10"
              : "border-purple-500/20 bg-[#0D0D0D]/40 hover:border-purple-500/40 hover:bg-purple-500/5"
          } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <span className="text-2xl opacity-60">📄</span>
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            <span className="text-purple-400 font-semibold">Click to upload</span> or drag &amp; drop
            <br />PDF, TXT, or DOCX — max 10 MB
          </p>
          {state.kind === "error" && (
            <p className="text-[11px] text-red-400 font-semibold mt-1">⚠️ {state.message}</p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="bg-[#141414] border border-purple-500/20 rounded-xl px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-xs text-purple-300">{state.step}</p>
          </div>
          <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 animate-pulse"
              style={{ width: "60%" }}
            />
          </div>
          <p className="text-[10px] text-gray-600">
            Generating embeddings via Gemini text-embedding-004...
          </p>
        </div>
      )}

      {/* Ready state */}
      {isReady && state.kind === "ready" && (
        <div className="bg-[#141414] border border-green-500/20 rounded-xl px-4 py-3 flex flex-col gap-3">
          {/* File info row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-green-400 shrink-0">✅</span>
              <p className="text-xs text-white font-semibold truncate">{state.fileName}</p>
            </div>
            <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full shrink-0 ml-2">
              {state.chunkCount} chunks indexed
            </span>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-800/60">
            <span className="text-[11px] text-gray-400">
              Use document as context
            </span>
            <button
              onClick={() => {
                const next = !ragEnabled;
                setRagEnabled(next);
                if (next) {
                  onDocumentReady(state.documentId, state.fileName, state.chunkCount);
                } else {
                  onClear();
                }
              }}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                ragEnabled ? "bg-purple-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  ragEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {ragEnabled && (
            <p className="text-[10px] text-purple-400/80 flex items-center gap-1">
              <span>📄</span> Document context active — LLMs will cite this document
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper: retrieve RAG context (called from parent components) ─────────────
export async function retrieveRagContext(
  documentId: string,
  query: string,
  topK = 5
): Promise<RagChunk[]> {
  try {
    const res = await fetch("/api/rag/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, query, topK }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.chunks ?? [];
  } catch {
    return [];
  }
}

// ─── Helper: format chunks as LLM context block ───────────────────────────────
export function formatRagContext(chunks: RagChunk[]): string {
  if (chunks.length === 0) return "";
  const lines = chunks.map(
    (c, i) =>
      `[Doc excerpt ${i + 1} — relevance: ${(c.score * 100).toFixed(0)}%]\n${c.text}`
  );
  return (
    "\n\nRELEVANT CONTEXT FROM UPLOADED DOCUMENT:\n" +
    "─".repeat(50) +
    "\n" +
    lines.join("\n\n") +
    "\n" +
    "─".repeat(50) +
    "\nUse the above document content to ground your arguments. Quote specific parts when relevant and cite as [Doc].\n"
  );
}
