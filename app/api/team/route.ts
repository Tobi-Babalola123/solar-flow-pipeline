import crypto from "crypto";
import nodemailer from "nodemailer";
import { getCaller, type Caller } from "@/lib/supabase-server";
import { memberLimit } from "@/lib/plans";

export const runtime = "nodejs";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

async function getOrg(c: Caller) {
  const { data } = await c.admin
    .from("organizations")
    .select("name, plan")
    .eq("id", c.profile.organization_id)
    .single();
  return data as { name: string; plan: string };
}

// ---------- List members and pending invites (owners and admins) ----------
export async function GET() {
  const c = await getCaller();
  if (!c) return Response.json({ error: "Please log in." }, { status: 401 });
  if (c.profile.role === "sales_rep")
    return Response.json({ error: "Not allowed." }, { status: 403 });

  const orgId = c.profile.organization_id;
  const org = await getOrg(c);
  const [{ data: members }, { data: invites }] = await Promise.all([
    c.admin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("organization_id", orgId)
      .order("created_at"),
    c.admin
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("organization_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return Response.json({
    members: members ?? [],
    invites: invites ?? [],
    limit: memberLimit(org.plan),
  });
}

// ---------- Send an invite ----------
export async function POST(req: Request) {
  const c = await getCaller();
  if (!c) return Response.json({ error: "Please log in." }, { status: 401 });
  if (c.profile.role === "sales_rep")
    return Response.json({ error: "Not allowed." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const role = String(body?.role ?? "");

  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  if (role !== "sales_rep" && role !== "admin")
    return Response.json({ error: "Choose a role." }, { status: 400 });
  if (role === "admin" && c.profile.role !== "owner")
    return Response.json(
      { error: "Only the owner can invite admins." },
      { status: 403 },
    );

  const orgId = c.profile.organization_id;
  const org = await getOrg(c);

  const { data: canWrite } = await c.admin.rpc("org_can_write", { org: orgId });
  if (!canWrite)
    return Response.json(
      { error: "Your trial has ended. Subscribe to add team members." },
      { status: 402 },
    );

  // Tidy up expired invites so the address can be invited again
  await c.admin
    .from("invitations")
    .delete()
    .eq("organization_id", orgId)
    .is("accepted_at", null)
    .lt("expires_at", new Date().toISOString());

  const { data: existing } = await c.admin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("email", email)
    .limit(1);
  if (existing && existing.length > 0)
    return Response.json(
      { error: "That person is already on your team." },
      { status: 409 },
    );

  // Seats: current members plus pending invites
  const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
    c.admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    c.admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("accepted_at", null),
  ]);
  const limit = memberLimit(org.plan);
  if ((memberCount ?? 0) + (inviteCount ?? 0) >= limit)
    return Response.json(
      {
        error: `Your plan includes ${limit} team members. Upgrade to add more.`,
      },
      { status: 403 },
    );

  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await c.admin.from("invitations").insert({
    organization_id: orgId,
    email,
    role,
    token_hash: sha(token), // the token itself is never stored
    invited_by: c.profile.id,
  });
  if (error) {
    if (error.code === "23505")
      return Response.json(
        { error: "That email already has a pending invite." },
        { status: 409 },
      );
    console.error("Invite insert failed:", error.message);
    return Response.json(
      { error: "Couldn't create the invite. Please try again." },
      { status: 500 },
    );
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const link = `${site}/invite/${token}`;

  // If email fails, the owner can still copy the link and send it on WhatsApp
  let emailSent = false;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    try {
      const inviter = c.profile.full_name || "A colleague";
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });
      await transporter.sendMail({
        from: `SolarFlow <${user}>`,
        to: email,
        subject: `${inviter.replace(/[\r\n]+/g, " ")} invited you to join ${org.name.replace(/[\r\n]+/g, " ")} on SolarFlow`,
        html: `<div style="font-family:sans-serif;max-width:480px">
          <h2 style="margin:0 0 12px">You're invited</h2>
          <p><b>${escapeHtml(inviter)}</b> invited you to join <b>${escapeHtml(org.name)}</b> on SolarFlow, the pipeline where the team manages solar leads.</p>
          <p style="margin:24px 0"><a href="${link}" style="background:#22c55e;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a></p>
          <p style="color:#777;font-size:13px">This link works once and expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
        </div>`,
      });
      emailSent = true;
    } catch (err) {
      console.error("Invite email failed:", err);
    }
  }

  return Response.json({ ok: true, link, emailSent });
}

// ---------- Remove a member or revoke an invite ----------
export async function DELETE(req: Request) {
  const c = await getCaller();
  if (!c) return Response.json({ error: "Please log in." }, { status: 401 });
  if (c.profile.role === "sales_rep")
    return Response.json({ error: "Not allowed." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const id = String(body?.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id))
    return Response.json({ error: "Invalid request." }, { status: 400 });
  const orgId = c.profile.organization_id;

  if (kind === "invite") {
    await c.admin
      .from("invitations")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);
    return Response.json({ ok: true });
  }

  if (kind === "member") {
    if (id === c.profile.id)
      return Response.json(
        { error: "You can't remove yourself." },
        { status: 400 },
      );

    const { data: target } = await c.admin
      .from("profiles")
      .select("id, role")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!target)
      return Response.json({ error: "Member not found." }, { status: 404 });

    const targetRole = (target as { role: string }).role;
    if (targetRole === "owner")
      return Response.json(
        { error: "The owner can't be removed." },
        { status: 403 },
      );
    if (targetRole === "admin" && c.profile.role !== "owner")
      return Response.json(
        { error: "Only the owner can remove admins." },
        { status: 403 },
      );

    // Deleting the login also removes the profile. Their leads become unassigned.
    const { error } = await c.admin.auth.admin.deleteUser(id);
    if (error) {
      console.error("Remove member failed:", error.message);
      return Response.json(
        { error: "Couldn't remove that person. Please try again." },
        { status: 500 },
      );
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Invalid request." }, { status: 400 });
}
