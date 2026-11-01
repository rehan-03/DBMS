"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeEventProposal, prepareEventProposal } from "@/lib/event-proposals";

// 1. Create a new event proposal
export async function createEventProposal(payload: any, expectedOrganizer?: { uid: string; role: "student" | "staff" }) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const userUid = (session.user as any).uid;
  const role = (session.user as any).role;
  if (!userUid || (role !== "student" && role !== "staff")) {
    throw new Error("Please sign in as a student or faculty member to submit an event.");
  }
  if (expectedOrganizer && (expectedOrganizer.uid !== userUid || expectedOrganizer.role !== role)) {
    throw new Error("Your login changed. Reopen Events from your current workspace and try again.");
  }
  const { data: profile, error: profileError } = await supabaseServer
    .from(role === "student" ? "students" : "staff")
    .select("department_id")
    .eq(role === "student" ? "uid" : "suid", userUid)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile?.department_id) throw new Error("Your profile needs a department before you can submit an event.");
  const proposal = {
    ...prepareEventProposal(payload),
    submitted_by: userUid,
    organizer_id: userUid,
    created_by: userUid,
    department_id: String(profile.department_id),
    status: "pending",
  };

  const { data, error } = await supabaseServer.from("event_proposals").insert([proposal]).select().single();

  if (error) throw new Error(error.message);
  return { success: true, data: normalizeEventProposal(data) };
}

// 2. Delete an event proposal (Only if Pending and owned by the user)
export async function deleteEventProposal(id: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const uid = (session.user as any).uid;
  const role = (session.user as any).role;

  const { data: prop, error: lookupError } = await supabaseServer.from("event_proposals").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!prop) throw new Error("This proposal could not be found. Refresh your proposal history.");
  const proposal = normalizeEventProposal(prop);
  if (proposal.status !== "pending") throw new Error("Only pending proposals can be deleted.");
  if (role === "hod") {
    if (String(prop.department_id) !== String((session.user as any).department_id)) {
      throw new Error("You can only manage proposals from your department.");
    }
  } else if (proposal.organizer_id !== uid) {
    throw new Error("You can only delete your own proposals.");
  }

  const { data, error } = await supabaseServer.from("event_proposals").delete().eq("id", id).eq("status", prop.status);
  if (error) throw new Error(error.message);
  if (!data?.count) throw new Error("The proposal changed. Refresh your proposal history and try again.");
  return { success: true };
}

// 3. Update Event Status (HOD ONLY)
export async function updateEventStatus(id: string, newStatus: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  // CRITICAL: Only HODs are allowed to approve/reject events!
  if ((session.user as any).role !== "hod") {
    throw new Error("Security Violation: Only HODs can approve events.");
  }

  const status = newStatus.toLowerCase();
  if (status !== "approved" && status !== "rejected") throw new Error("Choose approved or rejected.");
  const { data: proposal, error: lookupError } = await supabaseServer.from("event_proposals").select("*").eq("id", id).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!proposal) throw new Error("This proposal could not be found.");
  if (String(proposal.department_id) !== String((session.user as any).department_id)) {
    throw new Error("You can only review proposals from your department.");
  }

  const { data, error } = await supabaseServer
    .from("event_proposals")
    .update({ status })
    .eq("id", id);

  if (error) throw new Error(error.message);
  return { success: true, data };
}
