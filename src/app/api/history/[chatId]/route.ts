import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ddbDocClient, tableName } from "@/lib/dynamodb";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
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

    const { chatId } = await params;

    await ddbDocClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { userId, chatId },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[history/delete] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to delete history" }, { status: 500 });
  }
}
