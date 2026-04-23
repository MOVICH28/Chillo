import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.JWT_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const email = (profile as any)?.email as string | undefined;
      if (!email) return false;

      let dbUser = await prisma.user.findUnique({ where: { email } });

      if (!dbUser) {
        // Derive a base username from the Google name or email prefix
        const rawName = (profile as any)?.name as string | undefined;
        const baseUsername = rawName
          ? rawName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
          : email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");

        let username = baseUsername || "user";
        let suffix = 1;
        while (await prisma.user.findUnique({ where: { username } })) {
          username = `${baseUsername}_${suffix++}`;
        }

        dbUser = await prisma.user.create({
          data: {
            email,
            username,
            passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
            doraBalance: 1000,
          },
        });
      }

      user.id = dbUser.id;
      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },

    async session({ session, token }) {
      if (!token.sub) return session;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { id: true, doraBalance: true, username: true, email: true },
      });

      if (dbUser && session.user) {
        session.user.id = dbUser.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).doraBalance = dbUser.doraBalance;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).username = dbUser.username;
      }

      return session;
    },
  },
};
