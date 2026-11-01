"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase-server";

export async function updateStudentActivity(activityId: string, uid: string, newStatus: string) {
  // 1. Rate Limit Check:
  // Allow maximum 5 updates per 1 minute (60,000 ms) per UID.
  const isAllowed = checkRateLimit(`update-activity-${uid}`, 5, 60000);

  if (!isAllowed) {
    // Reject the request before it reaches the database
    throw new Error("Rate limit exceeded. Please wait a minute before making more updates.");
  }

  // 2. Perform the Database Update
  const { data, error } = await supabaseServer
    .from("student_activities")
    .update({ status: newStatus })
    .eq("activity_id", activityId)
    .eq("uid", uid); // Extra safety: ensure the user actually owns the record

  if (error) {
    console.error("MongoDB update error:", error);
    throw new Error("Failed to update activity.");
  }

  // 3. Return successful response
  return { success: true, data };
}