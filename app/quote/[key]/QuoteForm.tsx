"use client";

import { useState } from "react";

const input =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20";

export default function QuoteForm({
  captureKey,
  companyName,
}: {
  captureKey: string;
  companyName: string;
}) {
  const [f, setF] = useState({
    full_name: "",
    phone: "",
    email: "",
    location: "",
    message: "",
    website: "", // honeypot: real people never fill this in
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const email = f.email.trim();
    if (f.full_name.trim().length < 2)
      return setError("Please enter your name.");
    if (!f.phone.trim() && !email)
      return setError(
        "Please give a phone number or an email so we can reach you.",
      );
    if (f.phone.trim() && !/^[0-9+\s()\-]{7,20}$/.test(f.phone.trim()))
      return setError("Please enter a valid phone number.");
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      return setError("Please enter a valid email address.");

    setLoading(true);
    try {
      const res = await fetch("/api/leads/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, key: captureKey }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-5 py-8 text-gray-900">
      <div className="mx-auto max-w-lg">
        {done ? (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
              ✓
            </div>
            <h1 className="text-2xl font-bold">Thank you!</h1>
            <p className="mt-2 text-gray-600">
              {companyName} has your request and will get back to you shortly.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Request a solar quote</h1>
            <p className="mt-2 text-gray-600">
              Tell {companyName} a little about what you need and they'll
              contact you.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <input
                className={input}
                placeholder="Your full name *"
                aria-label="Your full name"
                autoComplete="name"
                maxLength={100}
                value={f.full_name}
                onChange={set("full_name")}
              />
              <input
                className={input}
                type="tel"
                placeholder="Phone / WhatsApp number"
                aria-label="Phone or WhatsApp number"
                autoComplete="tel"
                maxLength={20}
                value={f.phone}
                onChange={set("phone")}
              />
              <input
                className={input}
                type="email"
                placeholder="Email (optional if you gave a phone number)"
                aria-label="Email"
                autoComplete="email"
                maxLength={254}
                value={f.email}
                onChange={set("email")}
              />
              <input
                className={input}
                placeholder="Where is the property? (area or address)"
                aria-label="Property location"
                maxLength={200}
                value={f.location}
                onChange={set("location")}
              />
              <textarea
                className={`${input} min-h-[110px] resize-y`}
                placeholder="What do you need? For example: a 5kVA system for my 3-bedroom flat"
                aria-label="What do you need"
                maxLength={1000}
                value={f.message}
                onChange={set("message")}
              />

              {/* Honeypot */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
                value={f.website}
                onChange={set("website")}
              />

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-green-600 py-3.5 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                {loading ? "Sending..." : "Request my quote"}
              </button>

              <p className="text-xs text-gray-500">
                Your details are sent to {companyName} so they can contact you
                about your request.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
