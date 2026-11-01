// Connect once during server startup so the first sign-in does not have to
// wait for Atlas DNS discovery and TLS negotiation. Failed connections can retry.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MONGODB_URI) {
    const { getDb } = await import("./lib/mongodb");
    void getDb().catch(() => { console.warn("Atlas warm-up deferred; the next request will retry."); });
  }
}
