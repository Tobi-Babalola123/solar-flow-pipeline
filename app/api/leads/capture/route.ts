import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const DEFAULT_COUNTRY_CODE = "234"; // turns 0803... into 234803... in the WhatsApp link

// The key is public (it sits in website embeds), so anyone's site may post here.
// Safety comes from validation, rate limits and the honeypot, not from hiding the key.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: CORS });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

// In-memory rate limits. They reset on cold starts and are not shared between
// serverless instances. Fine for launch; move to Upstash/Redis when you scale.
const ipHits = new Map<string, number[]>();
const keyHits = new Map<string, number[]>();

function limited(
  map: Map<string, number[]>,
  id: string,
  max: number,
  windowMs: number,
) {
  const now = Date.now();
  const recent = (map.get(id) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  map.set(id, recent);
  if (map.size > 5000) map.clear();
  return recent.length > max;
}

type Db = SupabaseClient<any, "public", any, any, any>;

async function sendAlert(
  db: Db,
  orgId: string,
  lead: {
    full_name: string;
    phone: string | null;
    email: string | null;
    location: string | null;
    message: string | null;
  },
  origin: string,
) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return;

  const { data: admins } = await db
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .in("role", ["owner", "admin"]);

  const emails: string[] = [];
  for (const a of (admins as { id: string }[] | null) ?? []) {
    const { data } = await db.auth.admin.getUserById(a.id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return;

  let wa = "";
  if (lead.phone) {
    let digits = lead.phone.replace(/\D/g, "");
    if (digits.startsWith("0")) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
    wa = `https://wa.me/${digits}`;
  }
  const subjectName = lead.full_name.replace(/[\r\n]+/g, " ");
  const html = `<div style="font-family:sans-serif;max-width:520px">
    <h2 style="margin:0 0 8px">New website enquiry</h2>
    <p style="margin:0 0 16px;color:#555">Someone just filled in your quote form. Reply quickly: the first company to respond usually wins the job.</p>
    <table style="border-collapse:collapse;font-size:15px">
      <tr><td style="padding:4px 16px 4px 0;color:#777">Name</td><td><b>${escapeHtml(lead.full_name)}</b></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#777">Phone</td><td>${escapeHtml(lead.phone ?? "-")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#777">Email</td><td>${escapeHtml(lead.email ?? "-")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#777">Location</td><td>${escapeHtml(lead.location ?? "-")}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#777;vertical-align:top">Message</td><td>${escapeHtml(lead.message ?? "-")}</td></tr>
    </table>
    <p style="margin:20px 0 0">
      ${wa ? `<a href="${wa}" style="background:#22c55e;color:#000;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">Reply on WhatsApp</a>` : ""}
      <a href="${origin}/dashboard" style="border:1px solid #ccc;color:#111;padding:9px 16px;border-radius:8px;text-decoration:none">Open dashboard</a>
    </p>
  </div>`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await Promise.all(
    emails.map((to) =>
      transporter.sendMail({
        from: `SolarFlow <${user}>`,
        to,
        subject: `New website lead: ${subjectName}`,
        html,
      }),
    ),
  );
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (limited(ipHits, ip, 5, 10 * 60 * 1000))
    return json(
      { error: "Too many requests. Please try again in a few minutes." },
      429,
    );

  const raw = await req.text();
  if (raw.length > 10_000) return json({ error: "Request too large." }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object")
    return json({ error: "Invalid request." }, 400);

  // Honeypot: real visitors never see or fill this field. Pretend it worked.
  if (body.website) return json({ ok: true });

  const key = String(body.key ?? "");
  const full_name = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const location = String(body.location ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!/^[a-f0-9]{32}$/.test(key))
    return json({ error: "This form link isn't valid." }, 400);
  if (full_name.length < 2 || full_name.length > 100)
    return json({ error: "Please enter your name." }, 400);
  if (!phone && !email)
    return json(
      { error: "Please give a phone number or an email so we can reach you." },
      400,
    );
  if (phone && !/^[0-9+\s()\-]{7,20}$/.test(phone))
    return json({ error: "Please enter a valid phone number." }, 400);
  if (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)))
    return json({ error: "Please enter a valid email address." }, 400);
  if (location.length > 200 || message.length > 1000)
    return json({ error: "One of the fields is too long." }, 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Lead capture: missing Supabase environment variables");
    return json(
      { error: "Something went wrong. Please try again later." },
      500,
    );
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("capture_key", key)
    .maybeSingle();
  if (!org) return json({ error: "This form is no longer active." }, 404);
  const orgId = (org as { id: string }).id;

  // One company can't be flooded: cap submissions per form per hour
  if (limited(keyHits, key, 100, 60 * 60 * 1000))
    return json(
      {
        error:
          "This form is receiving too many requests. Please try again later.",
      },
      429,
    );

  // Don't create duplicates when someone submits twice in 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  for (const [column, value] of [
    ["email", email],
    ["phone", phone],
  ] as const) {
    if (!value) continue;
    const { data: dup } = await db
      .from("leads")
      .select("id")
      .eq("organization_id", orgId)
      .eq(column, value)
      .gte("created_at", since)
      .limit(1);
    if (dup && dup.length > 0) return json({ ok: true });
  }

  const { data: lead, error } = await db
    .from("leads")
    .insert({
      organization_id: orgId,
      full_name,
      phone: phone || null,
      email: email || null,
      location: location || null,
      notes: message || null,
      source: "Website",
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("Lead capture insert failed:", error?.message);
    return json(
      { error: "We couldn't send your request. Please try again." },
      500,
    );
  }

  await db.from("lead_activities").insert({
    organization_id: orgId,
    lead_id: (lead as { id: string }).id,
    user_id: null,
    activity: "Enquiry received from the website form",
  });

  // An email problem must never make the visitor think their request failed
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    await sendAlert(
      db,
      orgId,
      {
        full_name,
        phone: phone || null,
        email: email || null,
        location: location || null,
        message: message || null,
      },
      origin,
    );
  } catch (err) {
    console.error("Lead alert email failed:", err);
  }

  return json({ ok: true });
}
