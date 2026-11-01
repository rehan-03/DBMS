"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowRight, Plus, RefreshCw, CalendarDays, Pin, Check, BookOpen } from "lucide-react";
import { startActivityRefresh } from "@/lib/activity-refresh";
import { submitRsvp } from "@/app/actions/broadcasts";
import type { DashboardData, DashboardRow, PortalRole } from "@/lib/dashboard-types";

function dateLabel(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Date not set";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
export function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "pending").toLowerCase();
  const tone = ["approved", "up to date"].includes(normalized) ? "positive" : normalized === "rejected" ? "negative" : "neutral";
  return <span className={`status-badge ${tone}`}><span />{normalized.replace(/\b\w/g, letter => letter.toUpperCase())}</span>;
}
export function OverviewSkeleton() {
  return <div className="overview-skeleton" role="status" aria-label="Loading overview"><div className="skeleton-line title" /><div className="skeleton-line subtitle" /><div className="skeleton-metrics">{[0, 1, 2].map(index => <div key={index}><div className="skeleton-line" /><div className="skeleton-line value" /></div>)}</div><div className="skeleton-panel">{[0, 1, 2].map(index => <div className="skeleton-line" key={index} />)}</div></div>;
}

const copy = {
  student: { subtitle: "Your activities, proposals, and department updates in one place.", action: "Log an activity", path: "/student/log", section: "Recent activities", all: "/student/log", empty: "Your participation record starts here.", emptyDetail: "Log your first activity to send it to a faculty mentor for review." },
  staff: { subtitle: "A clear view of your students and the activities that need you.", action: "Review activities", path: "/staff/approvals", section: "Your department students", all: "/staff/mentees", empty: "No students in your directory yet.", emptyDetail: "Add your department students to start reviewing their activities." },
  hod: { subtitle: "Department activity and proposals, ready for your review.", action: "Review proposals", path: "/hod/approvals", section: "Awaiting your approval", all: "/hod/approvals", empty: "You're all caught up.", emptyDetail: "New event proposals will appear here when students and faculty submit them." },
};

export default function Overview({ role }: { role: PortalRole }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [voting, setVoting] = useState(false);
  const content = copy[role];
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.role !== role) return;
      setData(result); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load your overview."); }
    finally { setRefreshing(false); }
  }, [role]);
  useEffect(() => { void load(); return startActivityRefresh(load); }, [load]);

  async function respond(id: string, option: string) {
    setVoting(true);
    try {
      const result = await submitRsvp(id, option);
      if (!result.success) throw new Error(result.error);
      setData(previous => previous ? { ...previous, rsvps: { ...previous.rsvps, [id]: option } } : previous);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save your response."); }
    finally { setVoting(false); }
  }
  if (!data && !error) return <OverviewSkeleton />;

  const row = (item: DashboardRow) => <Link prefetch={false} key={item.id} href={item.href} className="record-row"><div className="record-symbol">{role === "staff" ? item.title.slice(0, 1) : <BookOpen size={17} />}</div><div className="record-title"><strong>{item.title}</strong><span>{item.detail}{item.date ? ` · ${dateLabel(item.date)}` : ""}</span></div><StatusBadge status={item.status} /><ArrowUpRight size={16} className="row-arrow" /></Link>;

  return <div className="overview">
    <header className="page-heading"><div><h1>Overview</h1><p>{content.subtitle}</p></div><Link prefetch={false} href={content.path} className="button-primary">{role === "student" ? <Plus size={16} /> : <ArrowUpRight size={16} />}{content.action}</Link></header>
    {error && <div className="inline-error" role="alert">{error}<button onClick={load}>Try again</button></div>}
    {data && <>
      <div className="overview-intro"><p>{data.name.split(" ")[0] === "Dr." || data.name.split(" ")[0] === "Prof." ? data.name : `Hello, ${data.name.split(" ")[0]}.`}<span>{data.department}</span></p><button className="refresh-button" disabled={refreshing} onClick={load}><RefreshCw size={13} className={refreshing ? "is-refreshing" : ""} />{refreshing ? "Refreshing" : "Refresh"}</button></div>
      <section className="metric-strip" aria-label="Activity summary">{data.metrics.map(metric => <div key={metric.label} className="metric"><p>{metric.label}</p><strong>{metric.value.toLocaleString("en-IN")}</strong><span>{metric.hint}</span></div>)}</section>
      {/* At 1440px: 232 sidebar + 72 gutters + 1136 canvas; two columns split
          the available canvas in a 1.7:1 ratio with one consistent 24px gap. */}
      <div className="overview-grid">
        <section className="panel activity-panel"><div className="panel-heading"><h2>{content.section}</h2><Link prefetch={false} href={content.all}>View all <ArrowRight size={14} /></Link></div>{data.rows.length ? <div className="record-list">{data.rows.map(row)}</div> : <div className="empty-state"><BookOpen size={24} /><h3>{content.empty}</h3><p>{content.emptyDetail}</p><Link prefetch={false} href={content.path} className="text-link">{content.action} <ArrowRight size={14} /></Link></div>}</section>
        <section className="panel"><div className="panel-heading"><h2>{role === "hod" ? "Recent proposals" : "Event proposals"}</h2><Link prefetch={false} href={role === "hod" ? "/hod/approvals" : `/${role}/events`} aria-label="View all event proposals"><ArrowUpRight size={17} /></Link></div><div className="event-list">{data.events.length ? data.events.slice(0, 3).map(event => <Link prefetch={false} href={event.href} key={event.id} className="event-row"><CalendarDays size={18} /><div><strong>{event.title}</strong><span>{dateLabel(event.date)}</span></div><StatusBadge status={event.status} /></Link>) : <div className="empty-small"><CalendarDays size={22} /><p>No event proposals yet.</p><Link prefetch={false} href={role === "hod" ? "/hod/approvals" : `/${role}/events`} className="text-link">{role === "hod" ? "Open approvals" : "Propose an event"}<ArrowRight size={14} /></Link></div>}</div></section>
      </div>
      <section className="panel notices-panel"><div className="panel-heading"><div><h2>Department notices</h2><p>Announcements from your department.</p></div>{role === "hod" && <Link prefetch={false} href="/hod/broadcasts">Manage notices <ArrowUpRight size={14} /></Link>}</div>{data.notices.length ? <div className="notice-grid">{data.notices.map(notice => <article key={notice.id} className="notice-item"><div className="notice-meta"><span>{dateLabel(notice.created_at)}</span>{notice.is_pinned && <span><Pin size={12} />Pinned</span>}{notice.urgency === "urgent" && <span className="urgent-note">Urgent</span>}</div><h3>{notice.title}</h3><p>{notice.message}</p>{notice.has_rsvp && notice.rsvp_options && <div className="poll-options">{notice.rsvp_options.map(option => <button key={option} disabled={voting} onClick={() => respond(notice.id, option)} aria-pressed={data.rsvps[notice.id] === option}>{data.rsvps[notice.id] === option && <Check size={13} />}{option}</button>)}</div>}{notice.attachments?.map((attachment, index) => /^https?:\/\//i.test(attachment.url) && <a className="text-link" key={index} href={attachment.url} target="_blank" rel="noreferrer">View attachment <ArrowUpRight size={13} /></a>)}</article>)}</div> : <div className="empty-small"><p>No new department notices.</p></div>}</section>
      {role === "student" && <div className="mentor-note"><GraduationLabel /><p>Your faculty mentor <strong>{data.mentor}</strong></p><Link prefetch={false} href="/student/mentorship">View mentorship <ArrowUpRight size={14} /></Link></div>}
    </>}
  </div>;
}
function GraduationLabel() { return <span className="mentor-symbol">M</span>; }
