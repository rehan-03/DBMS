"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { supabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// 1. Create Broadcast (HOD ONLY)
export async function createBroadcast(payload: any) {
  try {
    console.log("[createBroadcast] Starting broadcast creation with payload:", JSON.stringify(payload));
    const session = await getServerSession(authOptions);
    
    if (!session || (session.user as any).role !== "hod") {
      console.warn("[createBroadcast] Unauthorized attempt.");
      return { success: false, error: "Unauthorized: Only HODs can broadcast." };
    }

    console.log("[createBroadcast] Inserting into Supabase 'broadcasts' table...");
    const { data, error } = await supabaseServer.from("broadcasts").insert([payload]).select().single();
    
    if (error) {
      console.error("[createBroadcast] Supabase Insert Error:", error);
      return { success: false, error: error.message };
    }
    
    console.log("[createBroadcast] Broadcast created successfully. Data ID:", data?.id);
    
    // Revalidate paths that might show broadcasts
    revalidatePath("/hod/broadcasts");
    revalidatePath("/staff");
    revalidatePath("/student");
    
    return { success: true, data };
  } catch (error: any) {
    console.error("[createBroadcast] Unexpected Server Exception:", error);
    return { success: false, error: error.message || "An unexpected error occurred during broadcast creation." };
  }
}

// 2. Mark Broadcast as Read (Any User)
export async function markBroadcastRead(broadcastId: string, currentReceipts: string[]) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { success: false, error: "Unauthorized" };

    const uid = (session.user as any).uid;
    if (!currentReceipts.includes(uid)) {
      const newReceipts = [...currentReceipts, uid];
      const { error } = await supabaseServer.from("broadcasts").update({ read_receipts: newReceipts }).eq("id", broadcastId);
      if (error) {
        console.error("[markBroadcastRead] DB Error:", error);
        return { success: false, error: error.message };
      }
    }
    return { success: true };
  } catch (error: any) {
    console.error("[markBroadcastRead] Exception:", error);
    return { success: false, error: error.message || "Unexpected error." };
  }
}

// 3. Submit RSVP (Any User)
export async function submitRsvp(broadcastId: string, response: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { success: false, error: "Unauthorized" };

    const uid = (session.user as any).uid;

    const { error } = await supabaseServer
      .from("broadcast_rsvps")
      .upsert({
        broadcast_id: broadcastId,
        user_id: uid,
        response: response
      }, { onConflict: 'broadcast_id, user_id' });

    if (error) {
      console.error("[submitRsvp] DB Error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("[submitRsvp] Exception:", error);
    return { success: false, error: error.message || "Unexpected error." };
  }
}

// 4. Delete Broadcast (HOD ONLY)
export async function deleteBroadcast(broadcastId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "hod") {
      return { success: false, error: "Unauthorized: Only HODs can delete broadcasts." };
    }

    const { error } = await supabaseServer.from("broadcasts").delete().eq("id", broadcastId);
    if (error) {
      console.error("[deleteBroadcast] DB Error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/hod/broadcasts");
    revalidatePath("/staff");
    revalidatePath("/student");

    return { success: true };
  } catch (error: any) {
    console.error("[deleteBroadcast] Exception:", error);
    return { success: false, error: error.message || "Unexpected error." };
  }
}
