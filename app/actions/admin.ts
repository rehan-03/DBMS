"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { supabaseServer } from "@/lib/supabase-server";

// Generic DB Update for DB Explorer (HOD / Staff only)
export async function adminUpdateRecord(table: string, pkColumn: string, pkValue: string | number, payload: any) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role;
  if (role !== "hod" && role !== "staff") {
    throw new Error("Unauthorized: Only Staff and HODs can use DB Explorer.");
  }

  const { error } = await supabaseServer.from(table).update(payload).eq(pkColumn, pkValue);
  if (error) throw new Error(error.message);

  return { success: true };
}

// Fetch table data securely
export async function adminFetchTableData(table: string, page: number, pageSize: number, filters: { column: string; value: string }[]) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role;
  if (role !== "hod" && role !== "staff") {
    throw new Error("Unauthorized");
  }

  let query = supabaseServer.from(table).select("*", { count: "exact" });

  for (const filter of filters) {
    if (filter.column && filter.value) {
      query = query.ilike(filter.column, `%${filter.value}%`);
    }
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return { data, count };
}

// Fetch columns securely
export async function adminFetchTableColumns(table: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role;
  if (role !== "hod" && role !== "staff") {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabaseServer.from(table).select("*").limit(1);
  if (error) throw new Error(error.message);

  return { columns: data && data.length > 0 ? Object.keys(data[0]) : [] };
}
