"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BiSolidLeaf } from "react-icons/bi";
import { supabase } from "@/lib/supabase";

const input =
  "w-full rounded-xl border border-white/10 bg-black px-5 py-4 text-white placeholder:text-gray-500 outline-none focus:border-primary/60";

export default function AcceptForm({
  token,
  email,
  companyName,
  roleLabel,
}: {
  token: string;
  email: string;
  companyName: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (fullName.trim().length < 2) return setError("Please enter your name.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, full_name: fullName.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }

      // Account created: log straight in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        router.replace("/login");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <BiSolidLeaf className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold">SolarFlow</span>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <h1 className="mb-2 text-3xl font-bold">Join {companyName}</h1>
          <p className="mb-8 text-gray-400">
            You've been invited as {roleLabel}. Choose a password to get
            started.
          </p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <input
              className={input}
              value={email}
              readOnly
              aria-label="Your email"
            />
            <input
              className={input}
              placeholder="Your full name"
              autoComplete="name"
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-label="Your full name"
            />
            <input
              className={input}
              type="password"
              placeholder="Choose a password (8+ characters)"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
            />
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
              {loading ? "Setting up..." : "Join the team"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
