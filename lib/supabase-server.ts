import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server only. Uses the secret key, which bypasses row level security.
// Never import this file from a "use client" component.
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface Caller {
  user: { id: string; email?: string };
  profile: {
    id: string;
    organization_id: string;
    role: "owner" | "admin" | "sales_rep";
    full_name: string | null;
    email: string | null;
  };
  admin: ReturnType<typeof adminClient>;
}

// Works out who is calling an API route from their login cookie.
// Supabase verifies the session with its servers, so it can't be faked.
export async function getCaller(): Promise<Caller | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, organization_id, role, full_name, email")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    user: { id: user.id, email: user.email },
    profile: profile as Caller["profile"],
    admin,
  };
}
