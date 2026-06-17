import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  return NextResponse.json({
    session,
    userId: (session?.user as any)?.id ?? null,
    userEmail: session?.user?.email ?? null,
    awsRegion: process.env.APP_AWS_REGION ?? "UNDEFINED",
    tableName: process.env.DYNAMODB_TABLE_NAME ?? "UNDEFINED",
    hasSecret: !!process.env.AUTH_SECRET,
  });
}
