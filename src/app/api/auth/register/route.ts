import { NextResponse } from "next/server";
import { ddbDocClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    // Basic validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();

    // Check if user already exists
    let existingUser = null;
    try {
      const result = await ddbDocClient.send(
        new GetCommand({
          TableName: "Users",
          Key: { userId: emailKey },
        })
      );
      existingUser = result.Item;
    } catch (dbError: any) {
      if (
        dbError.name === "ResourceNotFoundException" ||
        dbError.message?.includes("Requested resource not found")
      ) {
        return NextResponse.json(
          { error: "Users table not found. Create it in AWS Console with partition key: userId (String)" },
          { status: 404 }
        );
      }
      throw dbError;
    }

    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    // Hash the password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const now = new Date().toISOString();

    // Insert user into table
    await ddbDocClient.send(
      new PutCommand({
        TableName: "Users",
        Item: {
          userId: emailKey,
          email: emailKey,
          name: name.trim(),
          passwordHash,
          authProvider: "credentials",
          firstLoginAt: now,
          lastLoginAt: now,
        },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[api/auth/register] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to register user" },
      { status: 500 }
    );
  }
}
