"use client";

import { getSession as fetchSession } from "next-auth/react";

let pending: ReturnType<typeof fetchSession> | null = null;

// Read-only session checks should not broadcast to every open browser tab.
// Share concurrent requests without keeping a potentially stale login cached.
export function getSession() {
  if (!pending) {
    pending = fetchSession({ broadcast: false }).finally(() => { pending = null; });
  }
  return pending;
}
