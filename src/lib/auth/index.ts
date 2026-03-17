import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: { scope: "read:user user:email" }
      }
    })
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Store/update user in database
      // Use try/catch so auth works even if DB is not ready
      try {
        const { db } = await import("@/lib/db");
        const { users } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");

        const githubProfile = profile as any;
        const existingUser = await db.select().from(users).where(eq(users.githubId, String(githubProfile.id))).limit(1);

        if (existingUser.length === 0) {
          await db.insert(users).values({
            githubId: String(githubProfile.id),
            email: user.email || null,
            name: user.name || githubProfile.login,
            avatarUrl: user.image || null,
            githubUsername: githubProfile.login,
            githubToken: account?.access_token || null,
          });
        } else {
          await db.update(users).set({
            email: user.email || existingUser[0].email,
            name: user.name || existingUser[0].name,
            avatarUrl: user.image || existingUser[0].avatarUrl,
            githubToken: account?.access_token || existingUser[0].githubToken,
            updatedAt: new Date(),
          }).where(eq(users.githubId, String(githubProfile.id)));
        }
      } catch (error) {
        console.warn("DB not available during sign-in, skipping user upsert:", error);
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (profile) {
        token.githubUsername = (profile as any).login;
        token.githubId = String((profile as any).id);
      }
      // Look up internal user ID
      if (token.githubId && !token.userId) {
        try {
          const { db } = await import("@/lib/db");
          const { users } = await import("@/lib/db/schema");
          const { eq } = await import("drizzle-orm");
          const [user] = await db.select({ id: users.id }).from(users).where(eq(users.githubId, token.githubId as string)).limit(1);
          if (user) token.userId = user.id;
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      if (token.githubUsername) (session.user as any).githubUsername = token.githubUsername as string;
      return session;
    }
  }
})
