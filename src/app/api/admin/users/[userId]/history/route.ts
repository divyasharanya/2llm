import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient, tableName } from "@/lib/dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || session.user.email !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;

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

    const response = NextResponse.json({ items: parsedItems });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Surrogate-Control", "no-store");
    return response;
  } catch (error: any) {
    if (
      error.name === "ResourceNotFoundException" ||
      error.message?.includes("Requested resource not found")
    ) {
      return NextResponse.json(
        { error: "UserChats table not found. Please create the UserChats table (userId partition key, chatId sort key) in AWS Console." },
        { status: 404 }
      );
    }
    console.error("[api/admin/users/history] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to list user history" },
      { status: 500 }
    );
  }
}
