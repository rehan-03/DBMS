import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getDb } from "@/lib/mongodb";
import { normalizeEventProposal } from "@/lib/event-proposals";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { uid: string; role: "student" | "staff" | "hod"; department_id: string } | undefined;
    if (!user || !["student", "staff", "hod"].includes(user.role)) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });
    const db = await getDb();
    const [profile, proposals] = await Promise.all([
      db.collection({ student: "students", staff: "staff", hod: "hods" }[user.role]).findOne({ [{ student: "uid", staff: "suid", hod: "huid" }[user.role]]: user.uid }, { projection: { _id: 0, password: 0 } }),
      db.collection("event_proposals").find(user.role === "hod"
        ? { department_id: user.department_id }
        : { $or: [{ organizer_id: user.uid }, { submitted_by: user.uid }, { created_by: user.uid }] },
      { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray(),
    ]);
    if (!profile) return NextResponse.json({ error: "Your college profile could not be found." }, { status: 404, headers });
    return NextResponse.json({ role: user.role, profile, proposals: proposals.map(normalizeEventProposal) }, { headers });
  } catch (error) {
    console.error("Event history load failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not load event proposals. Please try again." }, { status: 500, headers });
  }
}
