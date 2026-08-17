"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { businessPlans, getPlan, personalPlans } from "@/lib/plans";
import { REFERRAL_COOKIE } from "@/lib/referrals/config";

type Step = "form" | "otp";

function readRefCookie() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${REFERRAL_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : "";
}

function persistRef(code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return;
  document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(normalized)};path=/;max-age=${60 * 60 * 24 * 60};samesite=lax`;
}

export function CadastroForm() {
  const router = useRouter();
  const params = useSearchParams();
  const productParam = params.get("produto");
  const planParam = params.get("plano") || "";
  const planFromQuery = getPlan(planParam);
  const isPersonal =
    productParam === "pessoal" || planFromQuery?.product === "personal";

  const plans = useMemo(
    () => (isPersonal ? personalPlans() : businessPlans()),
    [isPersonal],
  );
  const defaultPlan =
    (planFromQuery && plans.some((p) => p.code === planFromQuery.code)
      ? planFromQuery.code
      : null) ||
    (isPersonal
      ? plans.find((p) => p.code === "personal_biblioteca")?.code
      : plans.find((p) => p.code === "business_profissional")?.code) ||
    plans[0]?.code ||
    (isPersonal ? "personal_biblioteca" : "business_essencial");

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
  const [referralCode, setReferralCode] = useState(
    () => params.get("ref")?.trim().toLowerCase() || "",
  );

  useEffect(() => {
    const fromQuery = params.get("ref")?.trim().toLowerCase();
    if (fromQuery) {
      persistRef(fromQuery);
      setReferralCode((current) => current || fromQuery);
      return;
    }
    const fromCookie = readRefCookie();
    if (fromCookie) setReferralCode((current) => current || fromCookie);
  }, [params]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const active = document.activeElement;
      const name =
        active instanceof HTMLElement ? active.getAttribute("name") : null;
      if (name === "signup-email" || name === "signup-password") return;
      setOwnerEmail("");
      setPassword("");
    }, 400);
    return () => window.clearTimeout(t);
  }, []);

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setDebugCode(null);
    if (referralCode) persistRef(referralCode);
    try {
      const res = await fetch("/api/auth/signup/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: tenantName || (isPersonal ? `Biblioteca de ${ownerName}` : ""),
          ownerName,
          ownerEmail,
          password,
          ownerWhatsapp,
          planCode,
          referralCode: referralCode || readRefCookie() || undefined,
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
      window.location.href = (data.redirect as string) || "/painel";
    } catch {
      setError("Erro ao verificar código.");
    } finally {
      setLoading(false);
    }
  }

  const selected = getPlan(planCode);
  const paid = (selected?.priceMonthlyBrl ?? 0) > 0;

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Link
        href={isPersonal ? "/#para-voce" : "/#planos"}
        className="text-sm hover:underline"
        style={{ color: "var(--lp-ink-soft, #78716c)" }}
      >
        ← Voltar aos planos
      </Link>
      <h1
        className="mt-4 text-2xl font-semibold"
        style={{
          fontFamily: "var(--font-landing-display), Georgia, serif",
          color: "var(--lp-ink, #0b1a2f)",
        }}
      >
        {isPersonal ? "Sua biblioteca" : "Começar teste"} — PrismaBook
      </h1>
      <p
        className="mt-2 text-sm"
        style={{ color: "var(--lp-ink-soft, #334a63)" }}
      >
        {paid
          ? "14 dias grátis, sem cartão. Você escolhe o plano depois de testar."
          : "Plano grátis: confirme o WhatsApp e entre no painel."}
      </p>
      {params.get("cancel") ? (
        <p className="mt-3 rounded-md border border-line bg-card px-3 py-2 text-sm text-muted">
          Checkout cancelado. Sua conta de teste continua no painel.
        </p>
      ) : null}

      {step === "form" ? (
        <form
          onSubmit={onSubmitForm}
          autoComplete="off"
          className="mt-8 space-y-4"
        >
          <div className="ga-autofill-trap" aria-hidden="true">
            <input
              type="text"
              name="username"
              tabIndex={-1}
              defaultValue=""
              autoComplete="username"
            />
            <input
              type="password"
              name="password"
              tabIndex={-1}
              defaultValue=""
              autoComplete="current-password"
            />
          </div>
          {isPersonal ? (
            <Field label="Nome da biblioteca (opcional)">
              <input
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Minha estante"
              />
            </Field>
          ) : (
            <Field label="Nome do sebo">
              <input
                required
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Sebo da Praça"
              />
            </Field>
          )}
          <Field label="Seu nome">
            <input
              required
              name="owner-name"
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </Field>
          <Field label="E-mail de acesso">
            <input
              required
              name="signup-email"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              readOnly
              onFocus={(e) => {
                e.currentTarget.readOnly = false;
              }}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha">
            <input
              required
              name="signup-password"
              type="password"
              minLength={6}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              readOnly
              onFocus={(e) => {
                e.currentTarget.readOnly = false;
              }}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="WhatsApp (com DDD)">
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
                  {p.name}
                  {p.priceMonthlyBrl
                    ? ` — ${p.priceMonthlyBrl.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}/mês`
                    : " — grátis"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Código de indicação (opcional)">
            <input
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toLowerCase())}
              placeholder="se alguém te indicou"
            />
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

      {step === "otp" ? (
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
            {loading ? "Criando conta…" : "Confirmar e entrar"}
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
