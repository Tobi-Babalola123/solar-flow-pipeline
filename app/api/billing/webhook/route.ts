import crypto from "crypto";
import { adminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Db = ReturnType<typeof adminClient>;
type PlanKey = "starter" | "growth";

type PaystackEvent = {
  event?: string;
  data?: any;
};

function safeCompareHex(received: string, expected: string) {
  if (!/^[a-f0-9]{128}$/i.test(received)) return false;

  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Supports Paystack's newer signing-secret format.
function verifyNewSignature(
  raw: string,
  header: string | null,
  signingSecret: string,
) {
  if (!header) return false;

  const parts = header.split(",").map((part) => part.trim());

  const timestampPart = parts.find((part) => part.startsWith("t="));
  if (!timestampPart) return false;

  const timestamp = Number(timestampPart.slice(2));

  if (!Number.isFinite(timestamp)) return false;

  // Reject signatures older than five minutes.
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .map((value) => value.split(":").pop() ?? "");

  if (!signatures.length) return false;

  const expected = crypto
    .createHmac("sha512", signingSecret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");

  return signatures.some((signature) => safeCompareHex(signature, expected));
}

// Supports the existing Paystack secret-key signature format.
function verifyLegacySignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha512", secret)
    .update(raw)
    .digest("hex");

  return safeCompareHex(signature, expected);
}

function validSignature(raw: string, req: Request) {
  const signingSecret = process.env.PAYSTACK_WEBHOOK_SIGNING_SECRET;

  const newSignature = req.headers.get("paystack-signature");

  if (newSignature && signingSecret) {
    return verifyNewSignature(raw, newSignature, signingSecret);
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) return false;

  return verifyLegacySignature(
    raw,
    req.headers.get("x-paystack-signature"),
    secret,
  );
}

function parseMeta(meta: unknown): Record<string, any> {
  if (!meta) return {};

  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  if (typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, any>;
  }

  return {};
}

function planFromCode(code?: string | null): PlanKey | null {
  if (!code) return null;

  if (code === process.env.PAYSTACK_PLAN_STARTER) return "starter";
  if (code === process.env.PAYSTACK_PLAN_GROWTH) return "growth";

  return null;
}

function getPlan(data: any, metadata: Record<string, any>): PlanKey | null {
  if (metadata.plan_key === "starter" || metadata.plan_key === "growth") {
    return metadata.plan_key;
  }

  const planCode =
    typeof data?.plan === "string"
      ? data.plan
      : (data?.plan?.plan_code ??
        data?.plan_object?.plan_code ??
        data?.subscription?.plan?.plan_code);

  return planFromCode(planCode);
}

function getNextPaymentDate(data: any): string | null {
  const value =
    data?.subscription?.next_payment_date ?? data?.next_payment_date;

  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Find the organisation associated with the Paystack event.
async function findOrg(db: Db, data: any): Promise<string | null> {
  const metadata = parseMeta(data?.metadata);

  // First: organisation ID supplied during checkout.
  const organizationId = metadata.organization_id;

  if (
    typeof organizationId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    return organizationId;
  }

  // Second: match the Paystack customer.
  const customerCode = data?.customer?.customer_code;

  if (customerCode) {
    const { data: org, error } = await db
      .from("organizations")
      .select("id")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();

    if (error) throw error;
    if (org) return org.id;
  }

  // Third: match the Paystack subscription.
  const subscriptionCode =
    data?.subscription?.subscription_code ?? data?.subscription_code;

  if (subscriptionCode) {
    const { data: org, error } = await db
      .from("organizations")
      .select("id")
      .eq("paystack_subscription_code", subscriptionCode)
      .maybeSingle();

    if (error) throw error;
    if (org) return org.id;
  }

  // Last resort: match the owner's email.
  const email = String(data?.customer?.email ?? "")
    .trim()
    .toLowerCase();

  if (email) {
    const { data: owners, error } = await db
      .from("profiles")
      .select("organization_id")
      .eq("email", email)
      .eq("role", "owner")
      .limit(2);

    if (error) throw error;

    // Only use email matching when exactly one owner matches.
    if (owners?.length === 1) {
      return owners[0].organization_id;
    }

    if (owners && owners.length > 1) {
      console.error("Multiple owners matched Paystack email:", email);
    }
  }

  return null;
}

async function updateOrganization(
  db: Db,
  organizationId: string,
  updates: Record<string, any>,
) {
  const { data, error } = await db
    .from("organizations")
    .update(updates)
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(`Organisation not found: ${organizationId}`);
  }
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!validSignature(raw, req)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: PaystackEvent;

  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!event.event || !event.data) {
    return new Response("Invalid event payload", { status: 400 });
  }

  const db = adminClient();
  const data = event.data;

  const customerCode: string | undefined = data?.customer?.customer_code;

  try {
    switch (event.event) {
      // Initial payment and successful subscription renewals.
      case "charge.success": {
        if (data?.status !== "success") break;

        const metadata = parseMeta(data?.metadata);
        const plan = getPlan(data, metadata);

        // Never activate a SolarFlow subscription for an
        // unrecognised Paystack plan.
        if (!plan) {
          console.error(
            "Successful Paystack charge has no recognised SolarFlow plan:",
            data?.reference,
          );
          break;
        }

        const organizationId = await findOrg(db, data);

        if (!organizationId) {
          console.error(
            "Could not match successful Paystack payment to an organisation:",
            data?.reference,
          );
          break;
        }

        const updates: Record<string, any> = {
          subscription_status: "active",
          plan,
          ...(customerCode ? { paystack_customer_code: customerCode } : {}),
        };

        // Do not invent a billing date or add 31 days.
        // Use Paystack's actual next payment date when supplied.
        const nextPaymentDate = getNextPaymentDate(data);

        if (nextPaymentDate) {
          updates.current_period_end = nextPaymentDate;
        }

        await updateOrganization(db, organizationId, updates);
        break;
      }

      // Paystack has created the subscription.
      case "subscription.create": {
        const metadata = parseMeta(data?.metadata);
        const plan = getPlan(data, metadata);

        if (!plan) {
          console.error(
            "Paystack subscription has an unrecognised plan:",
            data?.subscription_code,
          );
          break;
        }

        const organizationId = await findOrg(db, data);

        if (!organizationId) {
          console.error(
            "Could not match Paystack subscription to an organisation:",
            data?.subscription_code,
          );
          break;
        }

        const updates: Record<string, any> = {
          subscription_status: "active",
          plan,
          ...(data?.subscription_code
            ? { paystack_subscription_code: data.subscription_code }
            : {}),
          ...(customerCode ? { paystack_customer_code: customerCode } : {}),
        };

        const nextPaymentDate = getNextPaymentDate(data);

        if (nextPaymentDate) {
          updates.current_period_end = nextPaymentDate;
        }

        await updateOrganization(db, organizationId, updates);
        break;
      }

      // A subscription renewal payment failed.
      case "invoice.payment_failed": {
        const organizationId = await findOrg(db, data);

        if (!organizationId) {
          console.error(
            "Could not match failed Paystack invoice to an organisation.",
          );
          break;
        }

        await updateOrganization(db, organizationId, {
          subscription_status: "past_due",
        });

        break;
      }

      // The customer has cancelled or disabled automatic renewal.
      case "subscription.not_renew":
      case "subscription.disable": {
        const organizationId = await findOrg(db, data);

        if (!organizationId) {
          console.error(
            "Could not match cancelled Paystack subscription to an organisation.",
          );
          break;
        }

        await updateOrganization(db, organizationId, {
          subscription_status: "canceled",
        });

        break;
      }

      default:
        // Other Paystack events are acknowledged but not processed.
        break;
    }
  } catch (error) {
    console.error("Paystack webhook handling failed:", event.event, error);

    // A non-2xx response allows Paystack to retry.
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
