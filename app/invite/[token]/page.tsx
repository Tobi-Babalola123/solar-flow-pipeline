import crypto from "crypto";
import Link from "next/link";
import { adminClient } from "@/lib/supabase-server";
import AcceptForm from "./AcceptForm";

export const metadata = {
  title: "Join your team | SolarFlow",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function Invalid() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h1 className="text-2xl font-bold">This invitation isn't valid</h1>
        <p className="mt-3 text-gray-400">
          The link may have expired, or it was already used. Ask your manager to
          send a new invitation.
        </p>
        <Link href="/login" className="mt-6 inline-block text-primary">
          Go to log in
        </Link>
      </div>
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return <Invalid />;

  const admin = adminClient();
  const { data: invite } = await admin
    .from("invitations")
    .select("email, role, organization_id")
    .eq("token_hash", crypto.createHash("sha256").update(token).digest("hex"))
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!invite) return <Invalid />;

  const inv = invite as {
    email: string;
    role: string;
    organization_id: string;
  };
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", inv.organization_id)
    .single();

  return (
    <AcceptForm
      token={token}
      email={inv.email}
      companyName={(org as { name: string } | null)?.name ?? "your team"}
      roleLabel={inv.role === "admin" ? "an admin" : "a sales rep"}
    />
  );
}
