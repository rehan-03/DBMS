"use client";

import { useState } from "react";
import { UserRound, LockKeyhole, ArrowRight, BookOpen, CalendarDays, ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signIn, getSession } from "next-auth/react";

const DEMO_ACCOUNTS = [
  { label: "Student", uid: "2023CS001", password: "student123" },
  { label: "Faculty", uid: "STAFF101", password: "staff123" },
  { label: "HOD", uid: "HOD101", password: "hod123" },
];
const WORKSPACES: Record<string, string> = { student: "/student", staff: "/staff", hod: "/hod" };

export default function LandingPage() {
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function login(loginUid: string, loginPassword: string, demoLabel: string | null = null) {
    if (loading) return;
    setLoading(true); setActiveDemo(demoLabel); setError("");
    try {
      const result = await signIn("credentials", { uid: loginUid.trim().toUpperCase(), password: loginPassword, redirect: false });
      if (result?.error) throw new Error(result.error);
      const session = await getSession({ broadcast: false });
      const destination = WORKSPACES[(session?.user as { role?: string })?.role || ""];
      if (!destination) throw new Error("Your workspace could not be opened. Please try again.");
      router.push(destination);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in. Please try again.");
      setLoading(false); setActiveDemo(null);
    }
  }

  return <div className="login-page">
    <header className="login-top"><div className="login-brand"><Image src="/kkw.png" alt="KKW College" width={38} height={38} priority /><span className="wordmark">CampusPulse</span></div><span>KKW College of Engineering</span></header>
    <main className="login-main">
      <section className="login-intro" aria-label="About CampusPulse">
        <p>A little less paperwork. A lot more campus.</p>
        <h2>Campus life,<br />well organised.</h2>
        <p>One place for your activities, event proposals, and the people who help you make them happen.</p>
        <div className="login-features">
          <div className="login-feature"><BookOpen size={18} /><div><strong>A record that grows with you</strong><p>Log participation and keep your achievements together.</p></div></div>
          <div className="login-feature"><CalendarDays size={18} /><div><strong>From an idea to an event</strong><p>Propose events and follow every approval.</p></div></div>
          <div className="login-feature"><ClipboardCheck size={18} /><div><strong>Everyone on the same page</strong><p>Connect students, faculty, and your department.</p></div></div>
        </div>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">Welcome to CampusPulse</h1>
        <p>Sign in to your college workspace.</p>
        {(process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") && <div className="demo-logins"><p>Explore with a demo account</p><div className="demo-login-options">{DEMO_ACCOUNTS.map(account => <button key={account.uid} type="button" disabled={loading} aria-label={`Log in as demo ${account.label}`} onClick={() => { setUid(account.uid); setPassword(account.password); void login(account.uid, account.password, account.label); }}>{activeDemo === account.label ? "Opening…" : account.label}</button>)}</div></div>}
        <form onSubmit={event => { event.preventDefault(); void login(uid, password); }} aria-busy={loading}>
          {error && <p className="login-form-error" role="alert">{error}</p>}
          <div className="login-field"><label htmlFor="uid-input">College ID</label><div><UserRound size={17} aria-hidden="true" /><input id="uid-input" autoComplete="username" disabled={loading} value={uid} onChange={event => setUid(event.target.value)} placeholder="Your student, faculty, or HOD ID" required /></div></div>
          <div className="login-field"><label htmlFor="password-input">Password</label><div><LockKeyhole size={17} aria-hidden="true" /><input id="password-input" type="password" autoComplete="current-password" disabled={loading} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required /></div></div>
          <button type="submit" disabled={loading} className="button-primary login-submit">{loading && !activeDemo ? "Signing in…" : "Sign in to workspace"}<ArrowRight size={16} /></button>
        </form>
        <p className="login-card-note">Use the college ID assigned to your account.</p>
      </section>
    </main>
    <footer className="login-footer"><span>Made for your campus, built around you.</span><span>CampusPulse · KKW College</span></footer>
  </div>;
}
