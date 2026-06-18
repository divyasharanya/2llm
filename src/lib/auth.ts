import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ddbDocClient } from "@/lib/dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";

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
    async signIn({ user, account }) {
      const now = new Date().toISOString();

      if (account?.provider === "google" && user.email) {
        try {
          const userId = user.email.toLowerCase().trim();
          await ddbDocClient.send(
            new UpdateCommand({
              TableName: "Users",
              Key: { userId },
              UpdateExpression:
                "SET email = :email, #name = :name, image = :image, authProvider = :provider, lastLoginAt = :now, firstLoginAt = if_not_exists(firstLoginAt, :now)",
              ExpressionAttributeNames: { "#name": "name" },
              ExpressionAttributeValues: {
                ":email": user.email.toLowerCase().trim(),
                ":name": user.name || "",
                ":image": user.image || "",
                ":provider": "google",
                ":now": now,
              },
            })
          );
        } catch (error: any) {
          console.error("[signIn] Failed to sync Google user to DynamoDB:", error.message);
        }
      } else if (account?.provider === "credentials" && user.email) {
        try {
          const userId = user.email.toLowerCase().trim();
          await ddbDocClient.send(
            new UpdateCommand({
              TableName: "Users",
              Key: { userId },
              UpdateExpression: "SET lastLoginAt = :now",
              ExpressionAttributeValues: { ":now": now },
            })
          );
        } catch (error: any) {
          console.error("[signIn] Failed to update lastLoginAt for credentials user:", error.message);
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      // Only runs on sign-in when `user` is populated — binds identity to the token
      if (user) {
        token.id = (user.email ?? "").toLowerCase().trim();
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },

    async session({ session, token }) {
      // Always derive session identity from the JWT token, never from stale session.user
      session.user.name = token.name as string;
      session.user.email = token.email as string;
      session.user.image = token.picture as string;
      (session.user as any).id = token.id;
      (session.user as any).isAdmin =
        !!token.email &&
        !!process.env.ADMIN_EMAIL &&
        (token.email as string).toLowerCase().trim() ===
          process.env.ADMIN_EMAIL.toLowerCase().trim();
      return session;
    },
  },
});
