import { promises as dns } from 'node:dns';

let configured = false;

// Optional app-level override for networks where Node's default resolver
// cannot resolve Atlas SRV records. Leaves the computer's DNS settings alone.
export function configureMongoDns() {
  if (configured) return;
  const servers = (process.env.MONGODB_DNS_SERVERS || '')
    .split(',').map(server => server.trim()).filter(Boolean);
  if (servers.length > 0) {
    dns.setServers(servers);
    configured = true;
  }
}
