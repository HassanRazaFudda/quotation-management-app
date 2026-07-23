"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Button, Field, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { LoginResponse } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { token, setSession } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Skip the form.
  useEffect(() => {
    if (hydrated && token) router.replace("/");
  }, [hydrated, token, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api.login<LoginResponse>({ email, password });
      setSession(token, user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-xl font-bold text-white">
            J
          </div>
          <h1 className="text-xl font-bold text-ink">Junaidi Air Travels</h1>
          <p className="text-sm text-muted">Quotation System</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-card border border-line bg-white p-6 shadow-sm"
        >
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@junaidi.com"
              autoComplete="username"
              required
              autoFocus
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-600">{error}</p>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Powered by{" "}
          <a
            href="https://www.digitli.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink transition-colors hover:text-brand-600"
          >
            Digitli
          </a>
          <span className="mx-1.5 text-gray-300">·</span>
          www.digitli.com
        </p>
      </motion.div>
    </div>
  );
}
