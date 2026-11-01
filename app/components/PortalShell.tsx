"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LayoutDashboard, BookOpen, CalendarDays, Users, UserRound, ClipboardCheck, ChartNoAxesCombined, Database, Megaphone, GraduationCap, LogOut, Menu, X, ChevronRight } from "lucide-react";
import { usePortalAccess } from "@/lib/use-portal-access";
import type { PortalRole } from "@/lib/dashboard-types";

const navigation = {
  student: [
    { label: "Overview", path: "/student", icon: LayoutDashboard },
    { label: "Activity log", path: "/student/log", icon: BookOpen },
    { label: "Event proposals", path: "/student/events", icon: CalendarDays },
    { label: "Mentorship", path: "/student/mentorship", icon: GraduationCap },
    { label: "My profile", path: "/student/profile", icon: UserRound },
  ],
  staff: [
    { label: "Overview", path: "/staff", icon: LayoutDashboard },
    { label: "Review activities", path: "/staff/approvals", icon: ClipboardCheck },
    { label: "Students", path: "/staff/mentees", icon: Users },
    { label: "Event proposals", path: "/staff/events", icon: CalendarDays },
    { label: "My diary", path: "/staff/log", icon: BookOpen },
    { label: "Reports", path: "/staff/reports", icon: ChartNoAxesCombined },
    { label: "Database explorer", path: "/staff/db-explorer", icon: Database },
    { label: "My profile", path: "/staff/profile", icon: UserRound },
  ],
  hod: [
    { label: "Overview", path: "/hod", icon: LayoutDashboard },
    { label: "Students", path: "/hod/students", icon: Users },
    { label: "Faculty", path: "/hod/staff", icon: GraduationCap },
    { label: "Event approvals", path: "/hod/approvals", icon: ClipboardCheck },
    { label: "Notices", path: "/hod/broadcasts", icon: Megaphone },
    { label: "Database explorer", path: "/hod/db-explorer", icon: Database },
  ],
};
const roleNames = { student: "Student", staff: "Faculty", hod: "Head of department" };

export default function PortalShell({ role, children }: { role: PortalRole; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const portalUid = usePortalAccess(role);
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const links = navigation[role];
  const current = links.find(link => link.path === pathname)?.label || roleNames[role];

  useEffect(() => { setMenuOpen(false); document.title = `${current} · CampusPulse`; }, [pathname, current]);
  useEffect(() => {
    if (!menuOpen) return;
    navRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);

  if (!portalUid) return <div className="workspace-opening" role="status"><span className="loading-dot" />Opening your workspace…</div>;

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#workspace-content">Skip to content</a>
      <div className="mobile-header">
        <Link href={`/${role}`} className="wordmark">CampusPulse</Link>
        <button ref={menuButton} className="icon-button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="portal-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className="portal-sidebar" data-open={menuOpen}>
        <Link href={`/${role}`} className="sidebar-brand"><Image src="/kkw.png" alt="KKW College" width={36} height={36} /><span className="wordmark">CampusPulse</span></Link>
        <div className="workspace-label"><span className="workspace-symbol">K</span><div><strong>KKW College</strong><span>{roleNames[role]} workspace</span></div></div>
        <p className="nav-group-label">Workspace</p>
        <nav id="portal-navigation" ref={navRef} aria-label="Main navigation">
          {links.map(({ label, path, icon: Icon }) => <Link key={path} href={path} prefetch={false} onMouseEnter={() => router.prefetch(path)} onFocus={() => router.prefetch(path)} className={`nav-link ${pathname === path ? "active" : ""}`} aria-current={pathname === path ? "page" : undefined}><Icon size={17} strokeWidth={1.7} /><span>{label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><BookOpen size={17} /><p>Every activity counts.<span>Keep your campus record up to date.</span></p></div>
          <div className="account-row"><span className="avatar">{session?.user?.name?.slice(0, 1) || "K"}</span><div><strong>{session?.user?.name || portalUid}</strong><span>{portalUid}</span></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => signOut({ callbackUrl: "/" })}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <div className="portal-canvas">
        <div className="workspace-context"><span>Workspace</span><ChevronRight size={13} /><span>{current}</span><span className="role-caption">{roleNames[role]}</span></div>
        <main id="workspace-content" className="workspace-content" key={portalUid}>{children}</main>
        <footer className="workspace-footer">CampusPulse <span>KKW College of Engineering</span></footer>
      </div>
    </div>
  );
}
