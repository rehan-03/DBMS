import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getDb } from "@/lib/mongodb";
import { normalizeEventProposal } from "@/lib/event-proposals";
import type { DashboardData, DashboardRow, PortalRole } from "@/lib/dashboard-types";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { uid?: string; role?: PortalRole } | undefined;
    if (!user?.uid || !["student", "staff", "hod"].includes(user.role || "")) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });
    }
    const role = user.role!;
    const uid = user.uid;
    const db = await getDb();
    const profile = await db.collection({ student: "students", staff: "staff", hod: "hods" }[role])
      .findOne({ [{ student: "uid", staff: "suid", hod: "huid" }[role]]: uid }, { projection: { password: 0 } });
    if (!profile) return NextResponse.json({ error: "Your profile could not be found." }, { status: 404, headers });
    const departmentId = String(profile.department_id);
    const departmentFilter = { department_id: { $in: [departmentId, profile.department_id] } };
    const ownEvents = { $or: [{ organizer_id: uid }, { submitted_by: uid }, { created_by: uid }] };
    const [department, proposals, notices, rsvpRows] = await Promise.all([
      db.collection("departments").findOne(departmentFilter),
      db.collection("event_proposals").find(role === "hod" ? departmentFilter : ownEvents, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray(),
      db.collection("broadcasts").find({
        ...departmentFilter,
        ...(role === "hod" ? {} : { target_audience: { $in: ["all", role === "student" ? "students" : "staff"] } }),
        $or: [{ expires_at: null }, { expires_at: { $gt: new Date().toISOString() } }],
      }, { projection: { _id: 0 } }).sort({ is_pinned: -1, created_at: -1 }).limit(20).toArray(),
      db.collection("broadcast_rsvps").find({ user_id: uid }, { projection: { _id: 0, broadcast_id: 1, response: 1 } }).toArray(),
    ]);
    const events = proposals.map(normalizeEventProposal);
    const eventRows: DashboardRow[] = events.slice(0, 5).map(event => ({
      id: String(event.id), title: event.title, detail: event.event_type || "Event",
      date: event.start_date, status: event.status,
      href: role === "hod" ? "/hod/approvals" : `/${role}/events`,
    }));
    const data: DashboardData = {
      role, name: profile.name, department: department?.department_name || "Your department",
      metrics: [], rows: [], events: eventRows, notices: notices as unknown as DashboardData["notices"],
      rsvps: Object.fromEntries(rsvpRows.map(row => [row.broadcast_id, row.response])),
      updatedAt: new Date().toISOString(),
    };
    if (role === "student") {
      const [participations, legacy, coordinator] = await Promise.all([
        db.collection("activity_participants").aggregate([
          { $match: { student_uid: uid } },
          { $lookup: { from: "group_activities", localField: "activity_id", foreignField: "id", as: "activity" } },
          { $unwind: "$activity" },
          { $sort: { "activity.created_at": -1 } },
        ]).toArray(),
        db.collection("student_activities").find({ uid }).toArray(),
        profile.division ? db.collection("class_coordinators").findOne({ division: profile.division }) : null,
      ]);
      const activities = [
        ...participations.map(row => ({ id: String(row.activity_id), title: row.activity.title, detail: row.activity.category, date: row.activity.start_date, created: row.activity.created_at, status: row.status, href: "/student/log" })),
        ...legacy.map(row => ({ id: String(row.activity_id || row._id), title: row.activity_name, detail: row.type, date: row.from_date, created: row.created_at, status: row.status, href: "/student/log" })),
      ];
      data.rows = activities.sort((a, b) => String(b.created || b.date || "").localeCompare(String(a.created || a.date || ""))).slice(0, 5);
      const pending = activities.filter(row => !["approved", "rejected"].includes(String(row.status).toLowerCase())).length;
      data.metrics = [
        { label: "Activities logged", value: activities.length, hint: "Your participation record" },
        { label: "Awaiting review", value: pending, hint: "With your faculty mentors" },
        { label: "Approved activities", value: activities.filter(row => String(row.status).toLowerCase() === "approved").length, hint: "Reviewed and verified" },
      ];
      const mentor = coordinator?.suid ? await db.collection("staff").findOne({ suid: coordinator.suid }, { projection: { name: 1 } }) : null;
      data.mentor = mentor?.name || "Not assigned yet";
    } else if (role === "staff") {
      const [students, mentored, legacy, diaryCount] = await Promise.all([
        db.collection("students").find(departmentFilter, { projection: { uid: 1, name: 1, division: 1 } }).sort({ name: 1 }).toArray(),
        db.collection("activity_mentors").aggregate([
          { $match: { staff_suid: uid } },
          { $lookup: { from: "activity_participants", localField: "activity_id", foreignField: "activity_id", as: "participants" } },
        ]).toArray(),
        db.collection("student_activities").find({ suid: uid, status: { $in: ["Pending", "Proof Submitted"] } }).toArray(),
        db.collection("staff_activities").countDocuments({ suid: uid }),
      ]);
      const pending = [...mentored.flatMap(row => row.participants), ...legacy].filter(row => ["Pending", "Proof Submitted"].includes(row.status));
      data.rows = students.slice(0, 5).map(student => ({
        id: student.uid, title: student.name, detail: `${student.uid} · Division ${student.division || "—"}`,
        status: pending.some(row => (row.student_uid || row.uid) === student.uid) ? "Review needed" : "Up to date",
        href: `/staff/mentees?id=${encodeURIComponent(student.uid)}`,
      }));
      data.metrics = [
        { label: "Awaiting review", value: pending.length, hint: "Student activities to check" },
        { label: "Department students", value: students.length, hint: "In your student directory" },
        { label: "Diary entries", value: diaryCount, hint: "Your professional activities" },
      ];
    } else {
      const [studentCount, staffCount] = await Promise.all([
        db.collection("students").countDocuments(departmentFilter),
        db.collection("staff").countDocuments(departmentFilter),
      ]);
      const pending = events.filter(event => event.status === "pending");
      data.rows = pending.slice(0, 5).map(event => ({ id: String(event.id), title: event.title, detail: `${event.event_type} · ${event.organizer_id}`, date: event.start_date, status: event.status, href: "/hod/approvals" }));
      data.metrics = [
        { label: "Events to review", value: pending.length, hint: "Awaiting your decision" },
        { label: "Department students", value: studentCount, hint: "Across all divisions" },
        { label: "Faculty members", value: staffCount, hint: "In your department" },
      ];
    }
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Dashboard load failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We couldn't load your overview. Please try again." }, { status: 500, headers });
  }
}
