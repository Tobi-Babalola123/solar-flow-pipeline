import crypto from "crypto";
import { adminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// Basic per-IP limit (in memory; resets on cold starts)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 10;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (limited(ip))
    return Response.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );

  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  const full_name = String(body?.full_name ?? "").trim();
  const password = String(body?.password ?? "");

  if (!/^[a-f0-9]{64}$/.test(token))
    return Response.json(
      { error: "This invitation link isn't valid." },
      { status: 400 },
    );
  if (full_name.length < 2 || full_name.length > 100)
    return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (password.length < 8 || password.length > 72)
    return Response.json(
      { error: "Password must be between 8 and 72 characters." },
      { status: 400 },
    );

  const admin = adminClient();
  const { data: invite } = await admin
    .from("invitations")
    .select("id, organization_id, email, role")
    .eq("token_hash", sha(token))
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invite)
    return Response.json(
      {
        error:
          "This invitation has expired or was already used. Ask your manager for a new one.",
      },
      { status: 404 },
    );

  const inv = invite as {
    id: string;
    organization_id: string;
    email: string;
    role: string;
  };

  // app_metadata can only be set here on the server, so nobody can use it to join a company they weren't invited to.
  // email_confirm is true because the invite link itself proved they own this inbox.
  const { data: created, error } = await admin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
    app_metadata: { invite_org_id: inv.organization_id, invite_role: inv.role },
  });

  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    if (!exists) console.error("Accept invite failed:", error.message);
    return Response.json(
      {
        error: exists
          ? "This email already has a SolarFlow account. Ask your manager to invite a different email address."
          : "Couldn't create your account. Please try again.",
      },
      { status: exists ? 409 : 500 },
    );
  }

  // The signup trigger gives every new login a company of its own. For an invited person that is
  // wrong, so move them into the inviting company, then delete the throwaway company.
  // This does not depend on the trigger reading anything, so it works either way.
  const userId = created?.user?.id;
  if (!userId) {
    console.error("Accept invite: no user id returned");
    return Response.json(
      { error: "Couldn't create your account. Please try again." },
      { status: 500 },
    );
  }

  const { data: before } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  const strayOrg = (before as { organization_id: string } | null)
    ?.organization_id;

  const { error: moveError } = await admin
    .from("profiles")
    .update({ organization_id: inv.organization_id, role: inv.role })
    .eq("id", userId);

  if (moveError) {
    // Don't leave a half-made account behind: remove it so the invite link can be used again
    console.error("Accept invite: couldn't move profile:", moveError.message);
    await admin.auth.admin.deleteUser(userId);
    return Response.json(
      { error: "Couldn't add you to the team. Please try the link again." },
      { status: 500 },
    );
  }

  // Delete the throwaway company only after the profile has moved out of it
  if (strayOrg && strayOrg !== inv.organization_id) {
    await admin.from("organizations").delete().eq("id", strayOrg);
  }

  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id);
  return Response.json({ ok: true, email: inv.email });
}
