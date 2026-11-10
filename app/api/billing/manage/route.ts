import { getCaller } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST() {
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

    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      return Response.json(
        { error: "Billing isn't configured yet. Please contact support." },
        { status: 500 },
      );
    }

    // Retrieve the organisation's Paystack subscription code.
    const { data: org, error: orgError } = await c.admin
      .from("organizations")
      .select("paystack_subscription_code")
      .eq("id", c.profile.organization_id)
      .maybeSingle();

    if (orgError) {
      console.error("Subscription lookup failed:", orgError);

      return Response.json(
        { error: "Couldn't retrieve your subscription. Please try again." },
        { status: 500 },
      );
    }

    if (!org) {
      return Response.json(
        { error: "Your organisation could not be found." },
        { status: 404 },
      );
    }

    const code = org.paystack_subscription_code;

    if (!code) {
      return Response.json(
        { error: "No subscription was found for your account." },
        { status: 404 },
      );
    }

    // Request the subscription management link from Paystack.
    const url = `https://api.paystack.co/subscription/${encodeURIComponent(code)}/manage/link`;

    let res: Response;

    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      console.error("Paystack manage request failed:", error);

      return Response.json(
        {
          error:
            "Payment service is temporarily unavailable. Please try again.",
        },
        { status: 502 },
      );
    }

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.status || !json?.data?.link) {
      console.error("Paystack manage link failed:", {
        status: res.status,
        message: json?.message,
      });

      return Response.json(
        { error: "Couldn't open subscription management. Please try again." },
        { status: 502 },
      );
    }

    // Only allow secure Paystack management links.
    let manageUrl: URL;

    try {
      manageUrl = new URL(json.data.link);
    } catch {
      return Response.json(
        { error: "Paystack returned an invalid management link." },
        { status: 502 },
      );
    }

    const isPaystackDomain =
      manageUrl.protocol === "https:" &&
      (manageUrl.hostname === "paystack.com" ||
        manageUrl.hostname.endsWith(".paystack.com"));

    if (!isPaystackDomain) {
      console.error("Unexpected Paystack management URL:", manageUrl.hostname);

      return Response.json(
        { error: "Paystack returned an untrusted management link." },
        { status: 502 },
      );
    }

    return Response.json({
      url: manageUrl.toString(),
    });
  } catch (error) {
    console.error("Billing management error:", error);

    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
