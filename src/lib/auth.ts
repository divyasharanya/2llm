import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ddbDocClient } from "@/lib/dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";

console.log("AUTH DEBUG:", {
  AUTH_SECRET: process.env.AUTH_SECRET ? "DEFINED" : "MISSING",
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "DEFINED" : "MISSING",
  AUTH_URL: process.env.AUTH_URL ? "DEFINED" : "MISSING",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL ? "DEFINED" : "MISSING",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "DEFINED" : "MISSING",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "DEFINED" : "MISSING",
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const emailStr = (credentials.email as string).toLowerCase().trim();
          const result = await ddbDocClient.send(
            new GetCommand({
              TableName: "Users",
              Key: { userId: emailStr },
            })
          );

          const dbUser = result.Item;
          if (!dbUser || !dbUser.passwordHash) {
            return null;
          }

          const isValid = bcrypt.compareSync(
            credentials.password as string,
            dbUser.passwordHash
          );
          if (!isValid) {
            return null;
          }

          // Return user details for session creation
          return {
            id: dbUser.userId,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image || null,
          };
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log(
        "[auth:signIn] Callback triggered. Provider:",
        account?.provider,
        "| Email:",
        user?.email,
        "| ID:",
        user?.id,
        "| Profile sub:",
        (profile as any)?.sub
      );
      
      // For Google login, sync the user into the Users table (credentials users are inserted at signup)
      if (account?.provider === "google" && user.email) {
        try {
          const userId = user.email.toLowerCase().trim();
          const now = new Date().toISOString();
          console.log("[auth:signIn] Attempting DynamoDB update for Google user in Users table. userId:", userId);
          
          await ddbDocClient.send(
            new UpdateCommand({
              TableName: "Users",
              Key: { userId },
              UpdateExpression:
                "SET email = :email, #name = :name, image = :image, authProvider = :provider, lastLoginAt = :now, firstLoginAt = if_not_exists(firstLoginAt, :now)",
              ExpressionAttributeNames: {
                "#name": "name",
              },
              ExpressionAttributeValues: {
                ":email": user.email.toLowerCase().trim(),
                ":name": user.name || "",
                ":image": user.image || "",
                ":provider": "google",
                ":now": now,
              },
            })
          );
          console.log("[auth:signIn] Successfully updated Users table for Google user:", userId);
        } catch (error: any) {
          console.error("[auth:signIn] Error writing Google user to Users table:", error);
        }
      } else if (account?.provider === "credentials" && user.email) {
        // Update lastLoginAt for credentials user
        try {
          const userId = user.email.toLowerCase().trim();
          const now = new Date().toISOString();
          console.log("[auth:signIn] Attempting DynamoDB update for Credentials user in Users table. userId:", userId);
          
          await ddbDocClient.send(
            new UpdateCommand({
              TableName: "Users",
              Key: { userId },
              UpdateExpression: "SET lastLoginAt = :now",
              ExpressionAttributeValues: {
                ":now": now,
              },
            })
          );
          console.log("[auth:signIn] Successfully updated lastLoginAt for Credentials user:", userId);
        } catch (error: any) {
          console.error("[auth:signIn] Error updating lastLoginAt for Credentials user:", error);
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user && user.email) {
        token.id = user.email.toLowerCase().trim();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).isAdmin =
          session.user.email &&
          process.env.ADMIN_EMAIL &&
          session.user.email.toLowerCase().trim() === process.env.ADMIN_EMAIL.toLowerCase().trim();
      }
      return session;
    },
  },
});
