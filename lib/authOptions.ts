import type { AuthOptions } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0",
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.JWT_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "twitter") return true;

      const twitterId = account.providerAccountId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const twitterUsername = (profile as any)?.data?.username as string | undefined;
      const email = `twitter_${twitterId}@pumpdora.com`;

      let dbUser = await prisma.user.findUnique({ where: { email } });

      if (!dbUser) {
        // Build a unique username: prefer @handle, fall back to twitter_<id>
        const baseUsername = twitterUsername ?? `twitter_${twitterId}`;
        // Ensure uniqueness
        let username = baseUsername;
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

      // Attach our DB id — flows into token.sub via jwt callback
      user.id = dbUser.id;
      return true;
    },

    async jwt({ token, user }) {
      // On sign-in, user object is present; persist our DB id
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
