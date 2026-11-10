"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(
        "This reset link has expired or was already used. Request a new one from the login page.",
      );
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-2 text-3xl font-bold">Choose a new password</h1>
        <p className="mb-8 text-gray-400">Use at least 8 characters.</p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            aria-label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-primary/60"
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
            {loading ? "Saving..." : "Save password"}
          </button>
        </form>
        <Link
          href="/login"
          className="mt-6 block text-center text-sm text-primary"
        >
          Back to log in
        </Link>
      </div>
    </main>
  );
}
