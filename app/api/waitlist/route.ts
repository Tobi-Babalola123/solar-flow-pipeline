import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

// Basic per-IP rate limit. In-memory, so it resets on cold starts and is not
// shared between serverless instances. Fine for launch; use Upstash/Redis later.
const hits = new Map<string, { count: number; start: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

function limited(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_HITS;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (limited(ip)) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: bots fill this in. Pretend it worked.
  if (body.website) return Response.json({ ok: true });

  const full_name = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const company_name = String(body.company_name ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (full_name.length < 2 || full_name.length > 100)
    return Response.json({ error: "Enter your full name." }, { status: 400 });
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  if (company_name.length > 120 || message.length > 1000)
    return Response.json(
      { error: "One of the fields is too long." },
      { status: 400 },
    );
  if (body.consent !== true)
    return Response.json({ error: "Consent is required." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // server only, never NEXT_PUBLIC_
  if (!url || !serviceKey) {
    console.error("Missing Supabase environment variables");
    return Response.json(
      { error: "Server is not configured." },
      { status: 500 },
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from("waitlist")
    .insert([{ full_name, email, company_name, message, consent: true }]);

  if (error) {
    if (error.code === "23505")
      return Response.json({ error: "Already on the list." }, { status: 409 });
    console.error("Waitlist insert failed:", error.message);
    return Response.json(
      { error: "Could not save your details." },
      { status: 500 },
    );
  }

  // Emails must never fail the signup
  const mailUser = process.env.GMAIL_USER;
  const mailPass = process.env.GMAIL_APP_PASSWORD;
  if (mailUser && mailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: mailUser, pass: mailPass },
      });
      const from = `SolarFlow <${mailUser}>`;

      await transporter.sendMail({
        from,
        to: email,
        subject: "Welcome to SolarFlow",
        html: `<div style="font-family:sans-serif;padding:20px">
          <h1>Welcome to SolarFlow</h1>
          <p>Hi ${escapeHtml(full_name)},</p>
          <p>Thanks for signing up. We'll contact you shortly about your free trial.</p>
        </div>`,
      });

      if (process.env.NOTIFY_EMAIL) {
        await transporter.sendMail({
          from,
          to: process.env.NOTIFY_EMAIL,
          subject: `New SolarFlow signup: ${full_name.replace(/[\r\n]/g, " ")}`,
          html: `<p><b>${escapeHtml(full_name)}</b> (${escapeHtml(email)})</p>
                 <p>Company: ${escapeHtml(company_name || "-")}</p>
                 <p>${escapeHtml(message || "")}</p>`,
        });
      }
    } catch (err) {
      console.error("Email send failed:", err);
    }
  }

  return Response.json({ ok: true });
}
