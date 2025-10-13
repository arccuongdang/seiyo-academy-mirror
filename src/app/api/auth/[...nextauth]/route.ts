// src/app/api/auth/[...nextauth]/route.ts
/**
 * =============================================================================
 *  NextAuth (App Router) – Google + (optional) GitHub
 *  - JWT sessions
 *  - Gắn role "admin" nếu email thuộc ADMIN_EMAILS
 *  - Fix TS: session.user possibly undefined
 * =============================================================================
 */
import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";

/* -----------------------------------------------------------------------------
 * Admin email list from ENV
 * ---------------------------------------------------------------------------*/
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function isAdmin(email?: string | null): boolean {
  return !!email && adminEmails.has(email.toLowerCase());
}

/* -----------------------------------------------------------------------------
 * Providers (Google required, GitHub optional)
 * ---------------------------------------------------------------------------*/
const providers = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  }),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? [
        GithubProvider({
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
      ]
    : []),
];

/* -----------------------------------------------------------------------------
 * NextAuth options
 * ---------------------------------------------------------------------------*/
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    // Cho phép đăng nhập khi có email (tuỳ chỉnh rule nếu cần)
    async signIn({ user }) {
      if (!user?.email) return false;
      return true;
    },

    // Gắn thông tin & role vào token
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = (user as any).image ?? token.picture;
      }
      (token as any).role = isAdmin(token.email as string | undefined) ? "admin" : "user";
      return token;
    },

    // Map token → session.user (fix TS: session.user possibly undefined)
    async session({ session, token }) {
      // đảm bảo có session.user, rồi ghi qua biến u để TS biết chắc chắn
      const u = (session.user ??= {} as any);
      u.email = token.email as string | undefined;
      u.name = token.name as string | undefined;
      u.image = token.picture as string | undefined;
      u.role = (token as any).role ?? "user";
      return session;
    },
  },
};

/* -----------------------------------------------------------------------------
 * Route handlers export
 * ---------------------------------------------------------------------------*/
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
