import Link from "next/link";

export const metadata = { title: "Terms of Service | SolarFlow" };

// TODO: fill these in, then have the terms reviewed by a qualified person.
const COMPANY = "SolarFlow";
const CONTACT_EMAIL = "hello@yourdomain.com";
const UPDATED = "1 January 2027";

const sections = [
  [
    "Using the service",
    `${COMPANY} is a customer relationship tool for solar businesses. You must use it lawfully and keep your login details secure. You are responsible for activity under your account.`,
  ],
  [
    "Your data",
    "You own the data you put into the service. You give us permission to store and process it only to provide the service to you.",
  ],
  [
    "Free trial and payment",
    "Trials last 14 days unless stated otherwise. Paid plans are billed monthly in advance and you can cancel at any time. Cancellation takes effect at the end of the billing period.",
  ],
  [
    "Acceptable use",
    "Do not use the service to send spam, break the law, attempt to access other users' data, or interfere with the service.",
  ],
  [
    "Availability",
    "We work to keep the service running but cannot guarantee it will always be uninterrupted or error-free. We may update or change features over time.",
  ],
  [
    "Liability",
    "To the extent the law allows, we are not liable for indirect or consequential loss, and our total liability is limited to the fees you paid in the 3 months before the claim.",
  ],
  [
    "Changes and contact",
    `We may update these terms and will tell you about material changes. Questions: ${CONTACT_EMAIL}.`,
  ],
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <Link href="/" className="text-sm text-primary">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {UPDATED}
      </p>
      <div className="mt-8 space-y-6 leading-relaxed text-muted-foreground">
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              {title}
            </h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
