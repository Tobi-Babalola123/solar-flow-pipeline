import { createBrowserClient } from "@supabase/ssr";

// Same export name as before, so existing imports keep working.
// Sessions are stored in cookies, which lets middleware protect pages on the server.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
