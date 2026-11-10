"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BiSolidLeaf } from "react-icons/bi";
import { HiCheckCircle } from "react-icons/hi2";

/* ---------- Editable content ---------- */
const WHATSAPP_NUMBER = "234XXXXXXXXXX"; // your number, digits only, no +
const CONTACT_EMAIL = "hello@yourdomain.com";

const navLinks = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
];

const pains = [
  {
    title: "Enquiries get buried",
    body: "Leads arrive by WhatsApp, calls, Instagram and web forms. Without one inbox, the hot ones go cold.",
  },
  {
    title: "Follow-ups get forgotten",
    body: "Most solar sales are won on the third or fourth contact. Memory and spreadsheets don't schedule those.",
  },
  {
    title: "No idea what's working",
    body: "You can't tell which source sends buyers and which sends tyre-kickers, so ad money is guesswork.",
  },
];

const features = [
  {
    title: "Pipeline built for solar",
    points: [
      "Survey booked, quote sent, deposit paid, installed",
      "Drag a lead between stages",
      "See deal value at every stage",
    ],
  },
  {
    title: "Follow-up reminders",
    points: [
      "Set a date on any lead",
      "Overdue follow-ups are flagged",
      "One-tap WhatsApp message",
    ],
  },
  {
    title: "Capture from your website",
    points: [
      "Add a quote form to your site",
      "New leads appear instantly",
      "Email alert to your team",
    ],
  },
  {
    title: "Team and accountability",
    points: [
      "Assign leads to reps",
      "Notes and full activity history",
      "Reps only see their own leads",
    ],
  },
];

const steps = [
  {
    title: "Add your leads",
    body: "Import a spreadsheet or connect your website quote form.",
  },
  {
    title: "Work the pipeline",
    body: "Move each lead through survey, quote and deposit. Reminders tell you who to call today.",
  },
  {
    title: "Close and measure",
    body: "See conversion by source and by rep, then spend where it pays.",
  },
];

const plans = [
  {
    name: "Starter",
    price: "$29",
    note: "For a solo installer or a team of up to 3",
    points: [
      "Up to 500 leads",
      "Pipeline and reminders",
      "Website quote form",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: "$79",
    note: "For teams with several sales reps",
    points: [
      "Unlimited leads",
      "Up to 10 team members",
      "Assignments and activity history",
      "Lead source reports",
      "Priority support",
    ],
    highlight: true,
  },
  {
    name: "Business",
    price: "Custom",
    note: "Multiple branches or special needs",
    points: [
      "Everything in Growth",
      "Custom pipeline stages",
      "Data import help",
      "Onboarding call",
    ],
  },
];

const faqs = [
  {
    q: "Do I need a credit card to start?",
    a: "No. The trial is free and you can cancel any time.",
  },
  {
    q: "Can my sales reps use it on their phones?",
    a: "Yes. SolarFlow works in any mobile browser, so reps can update leads from site visits.",
  },
  {
    q: "Can I move my existing leads in?",
    a: "Yes. Upload a CSV and we map the columns. If you'd like help, we'll do the import with you.",
  },
  {
    q: "Is my data private?",
    a: "Each company's leads are kept separate, and only people you invite can see them.",
  },
  {
    q: "Who is SolarFlow for?",
    a: "Solar installers and solar sales teams. If you sell installations, it fits.",
  },
];

const mock = [
  {
    stage: "New",
    leads: [
      ["Adebayo O.", "5kVA home system"],
      ["Greenfield School", "Backup power"],
    ],
  },
  { stage: "Survey booked", leads: [["Mrs. Okafor", "3kVA + 4 batteries"]] },
  {
    stage: "Quote sent",
    leads: [
      ["Lekki Clinic", "15kVA commercial"],
      ["T. Bello", "5kVA hybrid"],
    ],
  },
  { stage: "Deposit paid", leads: [["Sunrise Hotel", "30kVA"]] },
];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/* ---------- Pipeline mockup ---------- */
function PipelineMock({ animate }: { animate: boolean }) {
  return (
    <div
      className="rounded-2xl border border-primary/20 bg-card/60 p-3 shadow-2xl shadow-primary/10 sm:p-4"
      aria-hidden="true"
    >
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mock.map((col, i) => (
          <div key={col.stage} className="rounded-xl bg-background/70 p-3">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{col.stage}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-muted-foreground">
                {col.leads.length}
              </span>
            </div>
            <div className="space-y-2">
              {col.leads.map(([name, need], j) => (
                <motion.div
                  key={name}
                  initial={animate ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.3 + i * 0.12 + j * 0.08,
                    duration: 0.5,
                  }}
                  className="rounded-lg border border-primary/15 bg-card p-2.5"
                >
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">{need}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- ROI calculator ---------- */
function RoiCalculator() {
  const [leads, setLeads] = useState(40);
  const [job, setJob] = useState(4000);
  const [close, setClose] = useState(15);
  const [lift, setLift] = useState(10);

  const n = (v: string, max: number) =>
    Math.min(max, Math.max(0, Number(v) || 0));
  const extraDeals = leads * (close / 100) * (lift / 100);
  const extraRevenue = extraDeals * job;

  const field =
    "mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

  return (
    <div className="grid gap-8 rounded-3xl border border-primary/20 bg-card/40 p-6 sm:p-10 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-5">
        <label className="text-sm text-muted-foreground">
          Leads per month
          <input
            className={field}
            inputMode="numeric"
            value={leads}
            onChange={(e) => setLeads(n(e.target.value, 100000))}
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Average job value (USD)
          <input
            className={field}
            inputMode="numeric"
            value={job}
            onChange={(e) => setJob(n(e.target.value, 10000000))}
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Current close rate (%)
          <input
            className={field}
            inputMode="numeric"
            value={close}
            onChange={(e) => setClose(n(e.target.value, 100))}
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Close-rate gain from faster follow-up (%)
          <input
            className={field}
            inputMode="numeric"
            value={lift}
            onChange={(e) => setLift(n(e.target.value, 100))}
          />
        </label>
      </div>
      <div className="flex flex-col justify-between rounded-2xl bg-primary/10 p-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Extra revenue per month
          </p>
          <p className="mt-1 text-5xl font-bold text-primary">
            {usd.format(extraRevenue)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            About {extraDeals.toFixed(1)} extra installations a month.
          </p>
        </div>
        <div className="mt-6">
          <Link
            href="/login?mode=signup"
            className="block w-full rounded-lg bg-primary py-3 text-center font-semibold text-black"
          >
            Start free trial
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            An illustration based on the numbers you enter, including your own
            estimate of the gain. It is not a guarantee.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function Home() {
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    company_name: "",
    message: "",
    website: "", // honeypot: real people never fill this in
    consent: false,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = showModal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModal]);

  const openModal = () => {
    setMenuOpen(false);
    setError("");
    setSuccess(false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const name = formData.full_name.trim();
    const email = formData.email.trim().toLowerCase();
    if (name.length < 2) return setError("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email))
      return setError("Enter a valid email address.");
    if (!formData.consent)
      return setError("Please agree to the privacy policy to continue.");

    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, full_name: name, email }),
      });

      if (res.status === 409) {
        setError("This email is already on the list.");
      } else if (res.status === 429) {
        setError("Too many attempts. Please try again in a few minutes.");
      } else if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Something went wrong. Please try again.");
      } else {
        setSuccess(true);
        setFormData({
          full_name: "",
          email: "",
          company_name: "",
          message: "",
          website: "",
          consent: false,
        });
      }
    } catch {
      setError("We couldn't reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const input =
    "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40";
  const primaryBtn =
    "rounded-lg bg-primary font-semibold text-black transition-shadow hover:shadow-lg hover:shadow-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <main className="overflow-x-hidden bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-primary/10 bg-background/85 backdrop-blur-xl">
        <nav
          className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
          aria-label="Main"
        >
          <a href="#top" className="flex items-center gap-2">
            <BiSolidLeaf className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold">SolarFlow</span>
          </a>
          <div className="hidden gap-8 md:flex">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-lg border border-primary/30 px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 sm:block"
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className={`${primaryBtn} hidden px-5 py-2 text-sm sm:block`}
            >
              Start free trial
            </Link>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="text-xl leading-none">
                {menuOpen ? "✕" : "☰"}
              </span>
            </button>
          </div>
        </nav>
        {menuOpen && (
          <div className="border-t border-primary/10 px-4 pb-6 pt-4 md:hidden">
            <div className="flex flex-col gap-4">
              {navLinks.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="text-base text-muted-foreground"
                >
                  {label}
                </a>
              ))}
              <Link href="/login" className="text-base text-primary">
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setMenuOpen(false)}
                className={`${primaryBtn} py-3 text-center`}
              >
                Start free trial
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section
        id="top"
        className="relative px-4 pb-24 pt-20 sm:px-6 lg:px-8 lg:pt-28"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[800px] -translate-x-1/2 bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h1 className="text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Stop losing solar leads to unanswered messages.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              SolarFlow gives your sales team one place to capture enquiries,
              follow up on time, and see which leads are close to paying a
              deposit.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/login?mode=signup"
                className={`${primaryBtn} px-8 py-4 text-center`}
              >
                Start free trial
              </Link>
              <a
                href="#roi"
                className="rounded-lg border border-primary/30 px-8 py-4 text-center font-semibold transition-colors hover:bg-primary/10"
              >
                See what slow follow-up costs you
              </a>
            </div>
            <ul className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6">
              {[
                "14-day free trial",
                "No credit card required",
                "Works on any phone",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <HiCheckCircle className="h-4 w-4 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-16">
            <PipelineMock animate={!reduceMotion} />
          </div>
        </div>
      </section>

      {/* Pain */}
      <section className="border-y border-primary/10 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-balance text-3xl font-bold sm:text-4xl">
            Most solar companies don't have a lead problem. They have a
            follow-up problem.
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {pains.map((p) => (
              <div key={p.title} className="border-l-2 border-primary/50 pl-5">
                <h3 className="text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI */}
      <section id="roi" className="scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-balance text-3xl font-bold sm:text-4xl">
            What are slow follow-ups costing you?
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Enter your own numbers. Change the last box to the gain you think is
            realistic for your team.
          </p>
          <div className="mt-10">
            <RoiCalculator />
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="scroll-mt-20 border-t border-primary/10 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-balance text-3xl font-bold sm:text-4xl">
            Everything a solar sales team needs, nothing it doesn't
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-primary/15 bg-card/40 p-8"
              >
                <h3 className="text-xl font-bold">{f.title}</h3>
                <ul className="mt-5 space-y-3">
                  {f.points.map((pt) => (
                    <li
                      key={pt}
                      className="flex items-start gap-3 text-muted-foreground"
                    >
                      <HiCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="scroll-mt-20 border-y border-primary/10 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Up and running in an afternoon
          </h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-black">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Simple pricing, billed monthly
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Prices in USD. Start free for 14 days and cancel any time.
          </p>
          <div className="mt-12 grid items-start gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-8 ${
                  p.highlight
                    ? "border-primary bg-primary/5"
                    : "border-primary/15 bg-card/40"
                }`}
              >
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-3 text-4xl font-bold">
                  {p.price}
                  {p.price.startsWith("$") && (
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      /month
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2">
                      <HiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {pt}
                    </li>
                  ))}
                </ul>
                {p.price.startsWith("$") ? (
                  <Link
                    href="/login?mode=signup"
                    className={`mt-8 block w-full rounded-lg py-3 text-center font-semibold transition-colors ${
                      p.highlight
                        ? "bg-primary text-black"
                        : "border border-primary/30 hover:bg-primary/10"
                    }`}
                  >
                    Start free trial
                  </Link>
                ) : (
                  <button
                    onClick={openModal}
                    className="mt-8 w-full rounded-lg border border-primary/30 py-3 font-semibold transition-colors hover:bg-primary/10"
                  >
                    Talk to us
                  </button>
                )}
                <button
                  onClick={openModal}
                  className={`${primaryBtn} px-8 py-4`}
                ></button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="scroll-mt-20 border-t border-primary/10 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Questions installers ask
          </h2>
          <div className="mt-10 divide-y divide-primary/10 border-y border-primary/10">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {f.q}
                  <span className="ml-4 text-primary transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-primary/30 bg-primary/10 p-10 text-center sm:p-16">
          <h2 className="text-balance text-3xl font-bold sm:text-4xl">
            Your next deposit may be sitting in an unanswered message.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Start your free trial, or message us and we'll walk you through it.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login?mode=signup"
              className={`${primaryBtn} px-8 py-4 text-center`}
            >
              Start free trial
            </Link>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi, I'd like to see a demo of SolarFlow.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-primary/40 px-8 py-4 font-semibold hover:bg-primary/10"
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-primary/10 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} SolarFlow</span>
          <div className="flex flex-wrap justify-center gap-6">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-foreground"
            >
              Contact
            </a>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
          </div>
        </div>
      </footer>

      {/* Signup modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="signup-title"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-primary/30 bg-[#111] p-8"
            >
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close"
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                ✕
              </button>

              {success ? (
                <div className="py-10 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-4xl text-primary">
                    ✓
                  </div>
                  <h3 className="mb-2 text-2xl font-bold text-white">
                    You're on the list
                  </h3>
                  <p className="text-gray-400">
                    Check your inbox for a confirmation. We'll be in touch about
                    your trial.
                  </p>
                  <button
                    onClick={() => setShowModal(false)}
                    className="mt-6 rounded-lg border border-white/10 px-6 py-3 text-white hover:bg-white/5"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <h2
                    id="signup-title"
                    className="mb-2 text-3xl font-bold text-white"
                  >
                    Talk to our team
                  </h2>
                  <p className="mb-6 text-gray-300">
                    Tell us about your business and what you need. We'll get
                    back to you shortly.
                  </p>
                  <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                    noValidate
                  >
                    <input
                      autoFocus
                      className={input}
                      placeholder="Full name"
                      aria-label="Full name"
                      autoComplete="name"
                      maxLength={100}
                      value={formData.full_name}
                      onChange={(e) =>
                        setFormData({ ...formData, full_name: e.target.value })
                      }
                    />
                    <input
                      className={input}
                      type="email"
                      placeholder="Work email"
                      aria-label="Work email"
                      autoComplete="email"
                      maxLength={254}
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                    <input
                      className={input}
                      placeholder="Company name"
                      aria-label="Company name"
                      autoComplete="organization"
                      maxLength={120}
                      value={formData.company_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          company_name: e.target.value,
                        })
                      }
                    />
                    <textarea
                      className={`${input} resize-none`}
                      rows={3}
                      placeholder="About how many leads do you get per month? (optional)"
                      aria-label="Message"
                      maxLength={1000}
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                    />
                    {/* Honeypot */}
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      className="absolute left-[-9999px] h-0 w-0 opacity-0"
                      value={formData.website}
                      onChange={(e) =>
                        setFormData({ ...formData, website: e.target.value })
                      }
                    />
                    <label className="flex items-start gap-3 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-green-500"
                        checked={formData.consent}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            consent: e.target.checked,
                          })
                        }
                      />
                      <span>
                        I agree to the{" "}
                        <Link
                          href="/privacy"
                          target="_blank"
                          className="underline"
                        >
                          privacy policy
                        </Link>{" "}
                        and to being contacted about SolarFlow.
                      </span>
                    </label>
                    {error && (
                      <p role="alert" className="text-sm text-red-400">
                        {error}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-primary py-4 font-semibold text-black disabled:opacity-50"
                    >
                      {loading ? "Sending..." : "Send enquiry"}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
