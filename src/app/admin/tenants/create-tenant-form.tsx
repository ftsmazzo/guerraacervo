"use client";

import { useState, useTransition } from "react";
import { createTenantAccount } from "@/app/admin/actions";

export function CreateTenantForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    slug: string;
  } | null>(null);

  return (
    <div className="mt-6 rounded-lg border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-ink">Nova conta de sebo</h2>
      <p className="mt-1 text-xs text-muted">
        Cria usuário owner + tenant em trial. Use um e-mail novo (não o admin da
        plataforma) para o sócio entrar num sebo limpo.
      </p>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setCreated(null);
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const res = await createTenantAccount({
              tenantName: String(fd.get("tenantName") || ""),
              slug: String(fd.get("slug") || "") || undefined,
              ownerName: String(fd.get("ownerName") || ""),
              ownerEmail: String(fd.get("ownerEmail") || ""),
              password: String(fd.get("password") || "") || undefined,
              trialDays: Number(fd.get("trialDays") || 14),
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setCreated({
              email: res.email,
              password: res.password,
              slug: res.slug,
            });
            e.currentTarget.reset();
          });
        }}
      >
        <label className="block text-xs text-muted">
          Nome do sebo
          <input
            name="tenantName"
            required
            placeholder="Sebo Parceiro"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          Slug (opcional)
          <input
            name="slug"
            placeholder="sebo-parceiro"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 font-mono text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          Nome do responsável
          <input
            name="ownerName"
            required
            placeholder="Sócio"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          E-mail de login
          <input
            name="ownerEmail"
            type="email"
            required
            placeholder="socio@empresa.com"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          Senha (opcional — gera se vazio)
          <input
            name="password"
            type="text"
            minLength={6}
            placeholder="mín. 6 caracteres"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-muted">
          Dias de trial
          <input
            name="trialDays"
            type="number"
            min={1}
            max={90}
            defaultValue={14}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Criando…" : "Criar conta"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Conta criada. Login em{" "}
          <a href="/login" className="underline">
            /login
          </a>
          :
          <pre className="mt-2 overflow-x-auto font-mono text-xs">
            {`E-mail: ${created.email}\nSenha:  ${created.password}\nSlug:   ${created.slug}`}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
