import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ddbDocClient } from "@/lib/dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
      console.log(
        "[auth:signIn] Callback triggered. Provider:",
        account?.provider,
        "| Email:",
        user?.email
      );

      // ── Google OAuth intent enforcement ──────────────────────────────────
      // The login and signup pages each set a short-lived cookie
      // ("auth-intent=login" or "auth-intent=signup") immediately before
      // calling signIn("google"). We read that cookie here to decide whether
      // to allow or block the OAuth completion.
      if (account?.provider === "google" && user.email) {
        const userId = user.email.toLowerCase().trim();
        const now = new Date().toISOString();

        // Read the intent cookie set by the page
        let intent: string | undefined;
        try {
          const cookieStore = await cookies();
          intent = cookieStore.get("auth-intent")?.value;
        } catch {
          // If cookies() is unavailable (e.g. older Next.js), default to no enforcement
          intent = undefined;
        }

        console.log("[auth:signIn] Google OAuth intent:", intent, "| userId:", userId);

        // Check whether this email already has a record in Users table
        let userExists = false;
        try {
          const existing = await ddbDocClient.send(
            new GetCommand({ TableName: "Users", Key: { userId } })
          );
          userExists = !!existing.Item;
        } catch (err: any) {
          // If the table doesn't exist yet, treat as non-existing user
          console.error("[auth:signIn] Error checking Users table:", err.message);
          userExists = false;
        }

        console.log("[auth:signIn] userExists:", userExists);

        // ── SIGNUP intent: block if account already exists ────────────────
        if (intent === "signup" && userExists) {
          console.log("[auth:signIn] BLOCKING signup — account already exists for:", userId);
          // Redirect back to login with an error param
          return "/login?error=AccountExists";
        }

        // ── LOGIN intent: block if account does NOT exist ─────────────────
        if (intent === "login" && !userExists) {
          console.log("[auth:signIn] BLOCKING login — no account found for:", userId);
          // Redirect back to signup with an error param
          return "/signup?error=NoAccount";
        }

        // ── Allowed: write / update the Users table ───────────────────────
        try {
          await ddbDocClient.send(
            new UpdateCommand({
              TableName: "Users",
              Key: { userId },
              UpdateExpression:
                "SET email = :email, #name = :name, image = :image, authProvider = :provider, lastLoginAt = :now, firstLoginAt = if_not_exists(firstLoginAt, :now)",
              ExpressionAttributeNames: { "#name": "name" },
              ExpressionAttributeValues: {
                ":email": userId,
                ":name": user.name || "",
                ":image": user.image || "",
                ":provider": "google",
                ":now": now,
              },
            })
          );
          console.log("[auth:signIn] Users table updated for Google user:", userId);
        } catch (err: any) {
          console.error("[auth:signIn] Error writing to Users table:", err.message);
          // Don't block login just because the write failed
        }

        return true;
      }

      // ── Credentials login: update lastLoginAt ────────────────────────────
      if (account?.provider === "credentials" && user.email) {
        try {
          const userId = user.email.toLowerCase().trim();
          const now = new Date().toISOString();
          await ddbDocClient.send(
            new UpdateCommand({
              TableName: "Users",
              Key: { userId },
              UpdateExpression: "SET lastLoginAt = :now",
              ExpressionAttributeValues: { ":now": now },
            })
          );
          console.log("[auth:signIn] lastLoginAt updated for credentials user:", userId);
        } catch (err: any) {
          console.error("[auth:signIn] Error updating lastLoginAt:", err.message);
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
          session.user.email.toLowerCase().trim() ===
            process.env.ADMIN_EMAIL.toLowerCase().trim();
      }
      return session;
    },
  },
});
