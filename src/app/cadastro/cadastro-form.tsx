"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { businessPlans } from "@/lib/plans";

type Step = "form" | "otp" | "checkout";

export function CadastroForm() {
  const router = useRouter();
  const params = useSearchParams();
  const plans = useMemo(() => businessPlans(), []);
  const defaultPlan =
    params.get("plano") ||
    plans.find((p) => p.code === "business_profissional")?.code ||
    plans[0]?.code ||
    "business_essencial";

  const [step, setStep] = useState<Step>("form");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [phoneHint, setPhoneHint] = useState("");
  const [otp, setOtp] = useState("");

  const [tenantName, setTenantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownerWhatsapp, setOwnerWhatsapp] = useState("");
  const [planCode, setPlanCode] = useState(defaultPlan);

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setDebugCode(null);
    try {
      const res = await fetch("/api/auth/signup/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName,
          ownerName,
          ownerEmail,
          password,
          ownerWhatsapp,
          planCode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.draftId && data.debugCode) {
          setDraftId(data.draftId);
          setDebugCode(data.debugCode);
          setPhoneHint(data.phoneHint || "");
          setStep("otp");
          setError(data.error || "WhatsApp falhou; use o código de debug.");
          return;
        }
        setError(data.error || "Falha ao enviar código.");
        return;
      }
      setDraftId(data.draftId);
      setPhoneHint(data.phoneHint || "");
      setStep("otp");
    } catch {
      setError("Erro de rede ao enviar código.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!draftId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, code: otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Código inválido.");
        return;
      }
      setStep("checkout");
      await startCheckout(draftId);
    } catch {
      setError("Erro ao verificar código.");
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Não foi possível abrir o Checkout.");
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Erro ao criar sessão Stripe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Link
        href="/#planos"
        className="text-sm hover:underline"
        style={{ color: "var(--lp-ink-soft, #78716c)" }}
      >
        ← Voltar aos planos
      </Link>
      <h1
        className="mt-4 text-2xl font-semibold"
        style={{
          fontFamily: "var(--font-landing-display), Georgia, serif",
          color: "var(--lp-ink, #1c1917)",
        }}
      >
        Começar teste — Negócio
      </h1>
      <p
        className="mt-2 text-sm"
        style={{ color: "var(--lp-ink-soft, #78716c)" }}
      >
        14 dias de trial com cartão. Você só é cobrado depois do período de
        teste.
      </p>
      {params.get("cancel") ? (
        <p className="mt-3 rounded-md border border-line bg-card px-3 py-2 text-sm text-muted">
          Checkout cancelado. Você pode tentar de novo quando quiser.
        </p>
      ) : null}

      {step === "form" ? (
        <form onSubmit={onSubmitForm} className="mt-8 space-y-4">
          <Field label="Nome do sebo">
            <input
              required
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Sebo da Praça"
            />
          </Field>
          <Field label="Seu nome">
            <input
              required
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </Field>
          <Field label="E-mail de acesso">
            <input
              required
              type="email"
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha">
            <input
              required
              type="password"
              minLength={6}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="WhatsApp do dono (com DDD)">
            <input
              required
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={ownerWhatsapp}
              onChange={(e) => setOwnerWhatsapp(e.target.value)}
              placeholder="11999998888"
            />
          </Field>
          <Field label="Plano">
            <select
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} —{" "}
                  {p.priceMonthlyBrl?.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  /mês
                </option>
              ))}
            </select>
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {loading ? "Enviando…" : "Enviar código no WhatsApp"}
          </button>
        </form>
      ) : null}

      {step === "otp" || step === "checkout" ? (
        <form onSubmit={onVerifyOtp} className="mt-8 space-y-4">
          <p className="text-sm text-muted">
            Digite o código enviado para {phoneHint || "seu WhatsApp"}.
          </p>
          {debugCode ? (
            <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-muted">
              Debug OTP: <strong>{debugCode}</strong>
            </p>
          ) : null}
          <Field label="Código">
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 tracking-widest outline-none focus:border-accent"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || otp.length < 6}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {loading ? "Aguarde…" : "Confirmar e ir ao pagamento"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-muted hover:text-ink"
            onClick={() => {
              setStep("form");
              setOtp("");
              setError(null);
            }}
          >
            Voltar ao formulário
          </button>
          {step === "checkout" && draftId ? (
            <button
              type="button"
              disabled={loading}
              className="w-full rounded-md border border-line px-4 py-2 text-sm"
              onClick={() => startCheckout(draftId)}
            >
              Abrir Checkout de novo
            </button>
          ) : null}
        </form>
      ) : null}

      <p className="mt-8 text-center text-sm text-muted">
        Já tem conta?{" "}
        <button
          type="button"
          className="text-accent-text underline"
          onClick={() => router.push("/login")}
        >
          Entrar
        </button>
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
