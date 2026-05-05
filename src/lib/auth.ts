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
          throw new Error("Vui lòng nhập đầy đủ email và mật khẩu");
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          console.log("User found in DB:", !!user);

          if (!user || !user.password) {
            throw new Error("Tài khoản không tồn tại hoặc không thể đăng nhập bằng mật khẩu");
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
          console.log("Password valid:", isPasswordValid);

          if (!isPasswordValid) {
            throw new Error("Mật khẩu không chính xác");
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
        token.role = (user as any).role;
      } 
      
      // Fallback: Nếu thiếu role, truy vấn trực tiếp từ DB
      if (!token.role && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email }
        });
        if (dbUser) {
          token.role = dbUser.role;
        }
      }

      // Hardcode cho admin mặc định để chắc chắn truy cập được
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
