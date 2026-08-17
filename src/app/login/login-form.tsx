"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        user?: { isPlatformAdmin?: boolean };
      };
      if (!res.ok) {
        setError(data.error ?? "Falha ao entrar.");
        return;
      }
      const next = searchParams.get("next") || "";
      const dest = data.user?.isPlatformAdmin
        ? next.startsWith("/admin")
          ? next
          : "/admin"
        : next.startsWith("/painel") || next.startsWith("/admin")
          ? next
          : "/painel";
      window.location.assign(dest);
      return;
    } catch {
      setError("Não foi possível conectar. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="text-muted">E-mail</span>
        <input
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Senha</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {error ? (
        <p className="rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-accent-text">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
