import PortalShell from "@/app/components/PortalShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="staff">{children}</PortalShell>;
}
