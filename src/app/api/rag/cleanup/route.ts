import { NextResponse } from "next/server";
import { ddbDocClient } from "@/lib/dynamodb";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const TABLE = "DocumentChunks";

export async function GET() {
  try {
    const now = new Date().toISOString();

    // Scan for all expired chunks
    const result = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "expiresAt < :now",
        ExpressionAttributeValues: { ":now": now },
        ProjectionExpression: "documentId, chunkId",
      })
    );

    const expired = result.Items ?? [];
    let deleted = 0;

    for (const item of expired) {
      await ddbDocClient.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { documentId: item.documentId, chunkId: item.chunkId },
        })
      );
      deleted++;
    }

    return NextResponse.json({ deleted, message: `Cleaned up ${deleted} expired chunks.` });
  } catch (err: any) {
    console.error("[rag/cleanup] Error:", err);
    return NextResponse.json({ error: err.message ?? "Cleanup failed" }, { status: 500 });
  }
}
