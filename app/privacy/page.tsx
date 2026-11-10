import Link from "next/link";

export const metadata = { title: "Privacy Policy | SolarFlow" };

// TODO: fill these in, then have the policy reviewed by a qualified person.
const COMPANY = "SolarFlow";
const CONTACT_EMAIL = "hello@yourdomain.com";
const UPDATED = "1 January 2027";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <Link href="/" className="text-sm text-primary">
        ← Back to home
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {UPDATED}
      </p>

      <div className="mt-8 space-y-6 leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            What we collect
          </h2>
          <p>
            When you sign up we collect your name, email address, company name
            and any message you write. If you use the {COMPANY} app, we also
            store the leads, notes and activity you add, and basic account
            details.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            How we use it
          </h2>
          <p>
            To set up your trial, contact you about {COMPANY}, provide and
            improve the service, and keep it secure. We do not sell your
            personal data.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Who we share it with
          </h2>
          <p>
            Service providers that help us run {COMPANY}, such as hosting,
            database and email providers. They may only use your data to provide
            their service to us.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Your leads and customer data
          </h2>
          <p>
            Data you enter about your own customers belongs to you. Each
            company's data is kept separate from other companies' data.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Your rights
          </h2>
          <p>
            You can ask us to access, correct or delete your personal data, or
            to stop contacting you, by emailing{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Retention
          </h2>
          <p>
            We keep your data while your account is active or while we need it
            to provide the service, and delete it on request unless the law
            requires us to keep it.
          </p>
        </section>
      </div>
    </main>
  );
}
