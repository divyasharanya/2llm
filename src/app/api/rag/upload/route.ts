import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient } from "@/lib/dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_WORDS_PER_CHUNK = 500;
const EMBED_DELAY_MS = 120; // avoid Gemini rate-limit (free tier: ~60 req/min)
const DOC_TTL_HOURS = 24;
const TABLE = "DocumentChunks";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\f/g, "\n") // form-feed / page break
    .replace(/[ \t]+/g, " ") // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n") // max 2 consecutive newlines
    .trim();
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let overlapTail: string[] = []; // last 2 sentences of previous chunk

  for (const para of paragraphs) {
    const words = para.split(/\s+/);

    if (words.length <= MAX_WORDS_PER_CHUNK) {
      // Paragraph fits in one chunk — prepend overlap from previous
      const body =
        overlapTail.length > 0
          ? overlapTail.join(" ") + " " + para
          : para;
      chunks.push(body.trim());
      const sentences = splitIntoSentences(para);
      overlapTail = sentences.slice(-2);
    } else {
      // Paragraph is too long — split by sentences
      const sentences = splitIntoSentences(para);
      let current: string[] = [...overlapTail];

      for (const sentence of sentences) {
        current.push(sentence);
        if (current.join(" ").split(/\s+/).length >= MAX_WORDS_PER_CHUNK) {
          chunks.push(current.join(" ").trim());
          // Keep last 2 sentences as overlap for the next sub-chunk
          overlapTail = current.slice(-2);
          current = [...overlapTail];
        }
      }
      if (current.length > overlapTail.length) {
        chunks.push(current.join(" ").trim());
        overlapTail = current.slice(-2);
      }
    }
  }

  return chunks.filter((c) => c.trim().length > 20); // drop tiny fragments
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Embedding API error: ${err?.error?.message || res.status}`);
  }
  const data = await res.json();
  return data.embedding?.values ?? [];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id ?? session.user.email;

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    // ── Parse multipart form ──────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name ?? "document";
    const mime = file.type ?? "";

    // ── Extract text ──────────────────────────────────────────────────────────
    let rawText = "";

    if (mime === "application/pdf" || fileName.endsWith(".pdf")) {
      // pdf-parse ships CJS; use require to avoid ESM .default type mismatch
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (
        buf: Buffer
      ) => Promise<{ text: string; numpages: number }>;
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    } else if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      // Plain text fallback
      rawText = buffer.toString("utf-8");
    }

    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract text from file, or file is too short." },
        { status: 422 }
      );
    }

    // ── Clean + chunk ─────────────────────────────────────────────────────────
    const cleaned = cleanText(rawText);
    const chunks = chunkText(cleaned);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Document produced no usable text chunks." },
        { status: 422 }
      );
    }

    // ── Embed + store ─────────────────────────────────────────────────────────
    const documentId = uuidv4();
    const now = Date.now();
    const expiresAt = new Date(now + DOC_TTL_HOURS * 3600 * 1000).toISOString();
    const createdAt = new Date(now).toISOString();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embedText(chunk, apiKey);

      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            documentId,
            chunkId: String(i).padStart(5, "0"), // zero-padded for sort order
            text: chunk,
            embedding: JSON.stringify(embedding),
            userId,
            fileName,
            createdAt,
            expiresAt,
          },
        })
      );

      // Rate-limit pause between embedding calls
      if (i < chunks.length - 1) await sleep(EMBED_DELAY_MS);
    }

    const response = NextResponse.json({
      documentId,
      chunkCount: chunks.length,
      fileName,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err: any) {
    console.error("[rag/upload] Error:", err);
    return NextResponse.json(
      { error: err.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
