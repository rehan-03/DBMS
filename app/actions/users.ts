"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { supabaseServer } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

export async function upsertStudent(payload: any) {
  const session = await getServerSession(authOptions);
  if (!session || ((session.user as any).role !== "staff" && (session.user as any).role !== "hod")) {
    throw new Error("Unauthorized: Only Staff/HODs can manage mentees.");
  }

  // Hash passwords if present in the payload
  const dataToUpsert = Array.isArray(payload) ? payload : [payload];
  for (const item of dataToUpsert) {
    if (item.password && !item.password.startsWith('$2')) {
      item.password = await bcrypt.hash(item.password, 10);
    }
  }

  const { error } = await supabaseServer.from("students").upsert(dataToUpsert, { onConflict: 'uid' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteStudent(uidToDelete: string) {
  const session = await getServerSession(authOptions);
  if (!session || ((session.user as any).role !== "staff" && (session.user as any).role !== "hod")) {
    throw new Error("Unauthorized: Only Staff/HODs can delete mentees.");
  }

  const { error } = await supabaseServer.from("students").delete().eq("uid", uidToDelete);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updatePassword(table: "students" | "staff" | "hods", newPassword: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const uid = (session.user as any).uid;
  const role = (session.user as any).role;

  // Ensure they are updating their own correct table
  if (table === "students" && role !== "student") throw new Error("Unauthorized");
  if (table === "staff" && role !== "staff") throw new Error("Unauthorized");
  if (table === "hods" && role !== "hod") throw new Error("Unauthorized");

  const pkColumn = table === "students" ? "uid" : (table === "staff" ? "suid" : "huid");

  // Hash the new password before storing
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const { error } = await supabaseServer.from(table).update({ password: hashedPassword }).eq(pkColumn, uid);
  if (error) throw new Error(error.message);
  return { success: true };
}
