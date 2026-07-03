import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient } from "@/lib/dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TABLE = "DocumentChunks";

// ─── Cosine Similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Embed Query ──────────────────────────────────────────────────────────────
async function embedQuery(text: string, apiKey: string): Promise<number[]> {
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
    throw new Error(`Embedding error: ${err?.error?.message ?? res.status}`);
  }
  const data = await res.json();
  return data.embedding?.values ?? [];
}

// ─── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { documentId, query, topK = 5 } = body as {
      documentId: string;
      query: string;
      topK?: number;
    };

    if (!documentId || !query) {
      return NextResponse.json({ error: "documentId and query are required" }, { status: 400 });
    }

    // ── Embed the query ───────────────────────────────────────────────────────
    const queryEmbedding = await embedQuery(query, apiKey);

    // ── Fetch all chunks for this document ────────────────────────────────────
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "documentId = :docId",
        ExpressionAttributeValues: { ":docId": documentId },
      })
    );

    const items = result.Items ?? [];
    if (items.length === 0) {
      return NextResponse.json({ chunks: [] });
    }

    // ── Score each chunk ──────────────────────────────────────────────────────
    const scored = items.map((item) => {
      let embedding: number[] = [];
      try {
        embedding = JSON.parse(item.embedding ?? "[]");
      } catch { /* malformed */ }
      return {
        chunkId: item.chunkId as string,
        text: item.text as string,
        score: cosineSimilarity(queryEmbedding, embedding),
      };
    });

    // ── Return top K ──────────────────────────────────────────────────────────
    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const response = NextResponse.json({ chunks: top });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err: any) {
    console.error("[rag/retrieve] Error:", err);
    return NextResponse.json({ error: err.message ?? "Retrieval failed" }, { status: 500 });
  }
}
