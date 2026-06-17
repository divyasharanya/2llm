import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient, tableName } from "@/lib/dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use id first, fall back to email as userId
    const userId = (session.user as any).id || session.user.email;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found in session" }, { status: 401 });
    }

    console.log("[history/save] userId:", userId, "| region:", process.env.AWS_REGION, "| table:", tableName);

    const { type, content } = await request.json();
    if (!type || !content) {
      return NextResponse.json({ error: "Missing type or content" }, { status: 400 });
    }

    const chatId = Date.now().toString();
    const createdAt = new Date().toISOString();

    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          userId,
          chatId,
          type,
          content: JSON.stringify(content),
          createdAt,
        },
      })
    );

    console.log("[history/save] Saved successfully. chatId:", chatId);
    return NextResponse.json({ success: true, chatId });
  } catch (error: any) {
    console.error("[history/save] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to save history" }, { status: 500 });
  }
}
