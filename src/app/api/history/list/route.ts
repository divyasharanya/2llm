import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient, tableName } from "@/lib/dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export async function GET() {
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

    console.log("[history/list] userId:", userId, "| region:", process.env.AWS_REGION, "| table:", tableName);

    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
      })
    );

    const items = result.Items || [];
    console.log("[history/list] Found", items.length, "items for userId:", userId);

    const parsedItems = items.map((item) => {
      let parsedContent = null;
      try {
        parsedContent = JSON.parse(item.content);
      } catch {
        parsedContent = item.content;
      }
      return {
        userId: item.userId,
        chatId: item.chatId,
        type: item.type,
        content: parsedContent,
        createdAt: item.createdAt,
      };
    });

    parsedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ items: parsedItems });
  } catch (error: any) {
    console.error("[history/list] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to list history" }, { status: 500 });
  }
}
