"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { supabaseServer } from "@/lib/supabase-server";

// Strip password from any record or array of records
function stripPasswords(data: any): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(item => {
      const { password, ...safe } = item;
      return safe;
    });
  }
  const { password, ...safe } = data;
  return safe;
}

// ── Student Reads ──────────────────────────────────────────

export async function fetchMyStudentProfile() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const role = (session.user as any)?.role;
  if (role !== "student") return null;
  const uid = (session.user as any)?.uid;
  if (!uid) return null;

  const { data, error } = await supabaseServer
    .from("students")
    .select("*")
    .ilike("uid", uid)
    .maybeSingle();

  if (error || !data) return null;
  return stripPasswords(data);
}

export async function fetchStudentByUid(uid: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { data: null, error: "Unauthorized: No session" };

    const { data, error } = await supabaseServer
      .from("students")
      .select("*")
      .eq("uid", uid)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: stripPasswords(data), error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

export async function fetchStudentsByDepartment(department_id: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { data: null, error: "Unauthorized: No session" };

    const { data, error } = await supabaseServer
      .from("students")
      .select("*")
      .eq("department_id", department_id)
      .order("name", { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: stripPasswords(data), error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

export async function fetchStudentsByUids(uids: string[]) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { data: null, error: "Unauthorized: No session" };

    const { data, error } = await supabaseServer
      .from("students")
      .select("uid, name")
      .in("uid", uids);

    if (error) return { data: null, error: error.message };
    return { data, error: null }; // Passwords aren't fetched here
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

export async function fetchStudentDirectory(columns: string = "uid, name") {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("students")
    .select(columns);
  if (error) throw new Error(error.message);
  return stripPasswords(data);
}



export async function fetchStudentsByDivisions(divisions: string[]) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("students")
    .select("*")
    .in("division", divisions)
    .order("name");
  if (error) throw new Error(error.message);
  return stripPasswords(data);
}

export async function checkStudentExists(uid: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("students")
    .select("uid")
    .eq("uid", uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchStudentsWithDivision() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("students")
    .select("uid, name, division");
  if (error) throw new Error(error.message);
  return data;
}

// ── Staff Reads ──────────────────────────────────────────

export async function fetchMyStaffProfile() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const role = (session.user as any)?.role;
  if (role !== "staff" && role !== "hod") return null;
  const uid = (session.user as any)?.uid;
  if (!uid) return null;

  const { data, error } = await supabaseServer
    .from("staff")
    .select("*")
    .ilike("suid", uid)
    .maybeSingle();

  if (error || !data) return null;
  return stripPasswords(data);
}

export async function fetchStaffBySuid(uid: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { data: null, error: "Unauthorized: No session" };

    const { data, error } = await supabaseServer
      .from("staff")
      .select("*")
      .eq("suid", uid)
      .maybeSingle();
    if (error) return { data: null, error: error.message };
    return { data: stripPasswords(data), error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

export async function fetchStaffDirectory(columns: string = "suid, name") {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("staff")
    .select(columns);
  if (error) throw new Error(error.message);
  return stripPasswords(data);
}

export async function fetchStaffName(suid: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("staff")
    .select("name")
    .eq("suid", suid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchStaffByDepartment(departmentId: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const { data, error } = await supabaseServer
    .from("staff")
    .select("*")
    .eq("department_id", departmentId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return stripPasswords(data);
}

// ── HOD Reads ──────────────────────────────────────────

export async function fetchMyHodProfile() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const role = (session.user as any)?.role;
  if (role !== "hod") return null;
  const uid = (session.user as any)?.uid;
  if (!uid) return null;

  const { data, error } = await supabaseServer
    .from("hods")
    .select("*")
    .ilike("huid", uid)
    .maybeSingle();

  if (error || !data) return null;
  return stripPasswords(data);
}
