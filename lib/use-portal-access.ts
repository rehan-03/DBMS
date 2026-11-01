"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type PortalRole = "student" | "staff" | "hod";
const PORTALS: Record<PortalRole, string> = {
  student: "/student", staff: "/staff", hod: "/hod",
};

// Recheck access when the shared browser login changes, and keep the form
// unmounted until its matching session is available.
export function usePortalAccess(requiredRole: PortalRole): string | null {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { uid?: string; role?: PortalRole } | undefined;
  const uid = user?.uid;
  const role = user?.role;

  useEffect(() => {
    if (status === "loading") return;
    if (!uid || role !== requiredRole) {
      router.replace(uid && role ? PORTALS[role] || "/" : "/");
    }
  }, [status, uid, role, requiredRole, router]);

  return status === "authenticated" && role === requiredRole && uid ? uid : null;
}
