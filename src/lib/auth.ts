import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("Authorize attempt for:", credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ email vÃ  máº­t kháº©u");
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          console.log("User found in DB:", !!user);

          if (!user || !user.password) {
            throw new Error("TÃ i khoáº£n khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng thá»ƒ Ä‘Äƒng nháº­p báº±ng máº­t kháº©u");
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
          console.log("Password valid:", isPasswordValid);

          if (!isPasswordValid) {
            throw new Error("Máº­t kháº©u khÃ´ng chÃ­nh xÃ¡c");
          }

          console.log("Authorize success - User Role:", user.role);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          console.error("Auth error:", error);
          throw error;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as any).id;
        token.role = (user as any).role;
      }

      // Keep token identity in sync with the current database. This prevents
      // stale JWTs from pointing at users that were removed by a local reseed.
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email }
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.role = dbUser.role;
        }
      }

      // Keep the seeded admin account elevated even if the token payload is incomplete.
      if (token.email === "admin@example.com") {
        token.role = "ADMIN";
      }

      console.log("JWT Callback - Final Role:", token.role);
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
      }
      console.log("Session Callback - Final Session Role:", (session.user as any)?.role);
      return session;
    },
  },
};
