import { getCaller } from "@/lib/supabase-server";

export const runtime = "nodejs";

type PlanKey = "starter" | "growth";

export async function POST(req: Request) {
  try {
    const c = await getCaller();

    if (!c) {
      return Response.json({ error: "Please log in." }, { status: 401 });
    }

    if (c.profile.role !== "owner") {
      return Response.json(
        { error: "Only the account owner can manage billing." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    const plan = body?.plan as PlanKey;

    if (plan !== "starter" && plan !== "growth") {
      return Response.json(
        { error: "Please select a valid subscription plan." },
        { status: 400 },
      );
    }

    if (!c.user.email) {
      return Response.json(
        { error: "Your account has no email address." },
        { status: 400 },
      );
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;

    const planCode =
      plan === "starter"
        ? process.env.PAYSTACK_PLAN_STARTER
        : process.env.PAYSTACK_PLAN_GROWTH;

    if (!secret || !planCode) {
      return Response.json(
        { error: "Billing isn't configured yet. Please contact support." },
        { status: 500 },
      );
    }

    // Retrieve the organisation's current billing information.
    const { data: org, error: orgError } = await c.admin
      .from("organizations")
      .select("id, subscription_status, current_period_end")
      .eq("id", c.profile.organization_id)
      .maybeSingle();

    if (orgError) {
      console.error("Checkout organisation lookup failed:", orgError);

      return Response.json(
        { error: "Couldn't verify your subscription. Please try again." },
        { status: 500 },
      );
    }

    if (!org) {
      return Response.json(
        { error: "Your organisation could not be found." },
        { status: 404 },
      );
    }

    const status = org.subscription_status;
    const periodEnd = org.current_period_end
      ? new Date(org.current_period_end).getTime()
      : 0;

    const paidThrough =
      status === "canceled" &&
      Number.isFinite(periodEnd) &&
      periodEnd > Date.now();

    // Prevent duplicate or overlapping subscriptions.
    if (status === "active" || status === "past_due" || paidThrough) {
      return Response.json(
        {
          error:
            "Your organisation already has a subscription or an outstanding payment. Please manage your existing subscription before starting another.",
        },
        { status: 409 },
      );
    }

    const siteUrl = new URL(
      process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin,
    );

    const callbackUrl = new URL(
      "/dashboard?billing=success",
      siteUrl,
    ).toString();

    // Initialise the Paystack subscription checkout.
    let res: Response;

    try {
      res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: c.user.email,
          plan: planCode,
          callback_url: callbackUrl,
          metadata: {
            organization_id: c.profile.organization_id,
            plan_key: plan,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      console.error("Paystack checkout request failed:", error);

      return Response.json(
        {
          error:
            "Payment service is temporarily unavailable. Please try again.",
        },
        { status: 502 },
      );
    }

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.status || !json?.data?.authorization_url) {
      console.error("Paystack initialize failed:", {
        status: res.status,
        message: json?.message,
      });

      return Response.json(
        { error: "Couldn't start checkout. Please try again." },
        { status: 502 },
      );
    }

    // Only redirect customers to a secure checkout URL.
    let checkoutUrl: URL;

    try {
      checkoutUrl = new URL(json.data.authorization_url);
    } catch {
      return Response.json(
        { error: "Paystack returned an invalid checkout link." },
        { status: 502 },
      );
    }

    if (checkoutUrl.protocol !== "https:") {
      return Response.json(
        { error: "Paystack returned an insecure checkout link." },
        { status: 502 },
      );
    }

    return Response.json({
      url: checkoutUrl.toString(),
    });
  } catch (error) {
    console.error("Billing checkout error:", error);

    return Response.json(
      { error: "Something went wrong while starting checkout." },
      { status: 500 },
    );
  }
}
