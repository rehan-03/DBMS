// Server-side MongoDB adapter — drop-in replacement for the Supabase server client.
// All files that imported { supabaseServer } from "@/lib/supabase-server" continue to work unchanged.
import { createAdapter } from './mongoAdapter';

export const supabaseServer = createAdapter();
