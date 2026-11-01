import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { supabaseServer } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "College UID",
      credentials: {
        uid: { label: "UID", type: "text", placeholder: "e.g. 2023CS001" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.uid || !credentials?.password) {
          throw new Error("Missing UID or password");
        }
        
        const uid = credentials.uid.trim().toUpperCase();
        const password = credentials.password;

        const accounts = [
          { table: "students", key: "uid", role: "student" },
          { table: "staff", key: "suid", role: "staff" },
          { table: "hods", key: "huid", role: "hod" },
        ];
        const results = await Promise.all(accounts.map(account =>
          supabaseServer.from(account.table)
            .select(account.key + ", name, department_id, password")
            .ilike(account.key, uid).maybeSingle()
        ));
        if (results.every(result => result.error)) {
          throw new Error("The database is temporarily unavailable. Please try again.");
        }
        for (let index = 0; index < accounts.length; index++) {
          const account = accounts[index];
          const record = results[index].data;
          if (!record?.password) continue;
          const matches = record.password.startsWith("$2")
            ? await bcrypt.compare(password, record.password)
            : record.password === password;
          if (matches) return {
            id: record[account.key], name: record.name,
            role: account.role, department_id: record.department_id,
          };
        }

        throw new Error("Invalid UID or password");
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      // The first time a user logs in, 'user' is populated from the authorize function
      if (user) {
        token.uid = user.id;
        token.role = (user as any).role;
        token.department_id = (user as any).department_id;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the data securely to the server/client session object
      if (token && session.user) {
        (session.user as any).uid = token.uid;
        (session.user as any).role = token.role;
        (session.user as any).department_id = token.department_id;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 Days
  },
  pages: {
    signIn: '/', // Using the existing landing page unified login
  },
  secret: process.env.NEXTAUTH_SECRET,
};
