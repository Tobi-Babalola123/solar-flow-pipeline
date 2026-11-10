import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import QuoteForm from "./QuoteForm";

export const metadata = {
  title: "Request a solar quote",
  robots: { index: false, follow: false }, // each company's form stays out of Google
};
export const dynamic = "force-dynamic";

export default async function QuotePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!/^[a-f0-9]{32}$/.test(key)) notFound();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) notFound();

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: org } = await db
    .from("organizations")
    .select("name")
    .eq("capture_key", key)
    .maybeSingle();
  if (!org) notFound();

  return (
    <QuoteForm captureKey={key} companyName={(org as { name: string }).name} />
  );
}
