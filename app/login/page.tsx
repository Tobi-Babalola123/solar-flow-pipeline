"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BiSolidLeaf } from "react-icons/bi";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup" | "forgot";

const titles: Record<Mode, [string, string]> = {
  signin: ["Welcome back", "Log in to your SolarFlow account"],
  signup: ["Create your account", "Start your 14-day free trial"],
  forgot: ["Reset your password", "We'll email you a reset link"],
};

function friendly(message: string) {
  const m = message.toLowerCase();

  if (m.includes("invalid login")) return "Incorrect email or password.";

  if (m.includes("not confirmed"))
    return "Confirm your email first. Check your inbox for the link.";

  if (m.includes("already registered"))
    return "An account with this email already exists. Log in instead.";

  if (m.includes("rate limit"))
    return "Too many attempts. Wait a few minutes and try again.";

  return "Something went wrong. Please try again.";
}

const input =
  "w-full rounded-xl border border-white/10 bg-black px-5 py-4 text-white placeholder:text-gray-500 outline-none focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );

  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setNotice("");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    const email = form.email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email))
      return setError("Enter a valid email address.");

    if (mode !== "forgot" && form.password.length < 8)
      return setError("Password must be at least 8 characters.");

    if (
      mode === "signup" &&
      (form.full_name.trim().length < 2 || form.company_name.trim().length < 2)
    )
      return setError("Enter your name and your company name.");

    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });

        if (error) throw error;

        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: form.password,
          options: {
            data: {
              full_name: form.full_name.trim(),
              company_name: form.company_name.trim(),
            },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (error) throw error;

        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
        } else {
          setNotice("Check your email to confirm your account, then log in.");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) throw error;

        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err: any) {
      setError(friendly(err?.message ?? ""));
    } finally {
      setLoading(false);
    }
  }

  const [title, subtitle] = titles[mode];

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <BiSolidLeaf className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold">SolarFlow</span>
        </Link>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <h1 className="mb-2 text-3xl font-bold">{title}</h1>
          <p className="mb-8 text-gray-400">{subtitle}</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === "signup" && (
              <>
                <input
                  className={input}
                  placeholder="Your full name"
                  autoComplete="name"
                  value={form.full_name}
                  onChange={set("full_name")}
                  maxLength={100}
                  aria-label="Full name"
                />

                <input
                  className={input}
                  placeholder="Company name"
                  autoComplete="organization"
                  value={form.company_name}
                  onChange={set("company_name")}
                  maxLength={120}
                  aria-label="Company name"
                />
              </>
            )}

            <input
              className={input}
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
              maxLength={254}
              aria-label="Email"
            />

            {mode !== "forgot" && (
              <input
                className={input}
                type="password"
                placeholder="Password (8+ characters)"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={form.password}
                onChange={set("password")}
                aria-label="Password"
              />
            )}

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            {notice && (
              <p role="status" className="text-sm text-primary">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-4 font-semibold text-black disabled:opacity-50"
            >
              {loading
                ? "Please wait..."
                : mode === "signin"
                  ? "Log in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm text-gray-400">
            {mode === "signin" && (
              <>
                <button
                  onClick={() => switchMode("forgot")}
                  className="block w-full hover:text-white"
                >
                  Forgot your password?
                </button>

                <p>
                  New to SolarFlow?{" "}
                  <button
                    onClick={() => switchMode("signup")}
                    className="text-primary"
                  >
                    Create an account
                  </button>
                </p>
              </>
            )}

            {mode !== "signin" && (
              <button
                onClick={() => switchMode("signin")}
                className="text-primary"
              >
                Back to log in
              </button>
            )}
          </div>
        </div>

        {mode === "signup" && (
          <p className="mt-4 text-center text-xs text-gray-500">
            By creating an account you agree to our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black text-white">
          Loading...
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
