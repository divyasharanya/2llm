import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || session.user.email !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Scan Users Table
    const usersResult = await ddbDocClient.send(
      new ScanCommand({
        TableName: "Users",
      })
    );
    const users = usersResult.Items || [];

    // 2. Scan UserChats Table to calculate global statistics
    const chatsResult = await ddbDocClient.send(
      new ScanCommand({
        TableName: "UserChats",
      })
    );
    const chats = chatsResult.Items || [];

    let totalDebates = 0;
    let totalCodeReviews = 0;
    const userChatCounts: Record<string, number> = {};

    chats.forEach((chat) => {
      if (chat.type === "debate") {
        totalDebates++;
      } else if (chat.type === "code-review") {
        totalCodeReviews++;
      }

      if (chat.userId) {
        userChatCounts[chat.userId] = (userChatCounts[chat.userId] || 0) + 1;
      }
    });

    // Determine the most active user
    let mostActiveUserId: string | null = null;
    let maxChats = 0;

    Object.entries(userChatCounts).forEach(([userId, count]) => {
      if (count > maxChats) {
        maxChats = count;
        mostActiveUserId = userId;
      }
    });

    let mostActiveUser = null;
    if (mostActiveUserId) {
      const matchingUser = users.find((u) => u.userId === mostActiveUserId);
      mostActiveUser = {
        userId: mostActiveUserId,
        name: matchingUser?.name || "Unknown User",
        email: matchingUser?.email || "Unknown Email",
        chatCount: maxChats,
      };
    }

    const response = NextResponse.json({
      users,
      stats: {
        totalUsers: users.length,
        totalDebates,
        totalCodeReviews,
        mostActiveUser,
      },
    });
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
        { error: "Users or UserChats table not found. Please create the Users table (userId partition key) and UserChats table (userId partition key, chatId sort key) in AWS Console." },
        { status: 404 }
      );
    }
    console.error("[api/admin/users] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to fetch admin users data" },
      { status: 500 }
    );
  }
}
