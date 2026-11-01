export type PortalRole = "student" | "staff" | "hod";
export type DashboardRow = {
  id: string; title: string; detail: string; date?: string; status: string; href: string;
};
export type DashboardNotice = {
  id: string; title: string; message: string; created_at?: string;
  is_pinned?: boolean; urgency?: string; has_rsvp?: boolean; rsvp_options?: string[];
  attachments?: { type: string; url: string }[];
};
export type DashboardData = {
  role: PortalRole; name: string; department: string;
  metrics: { label: string; value: number; hint: string }[];
  rows: DashboardRow[]; events: DashboardRow[];
  notices: DashboardNotice[]; rsvps: Record<string, string>;
  mentor?: string; updatedAt: string;
};
