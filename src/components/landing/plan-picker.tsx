"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Entitlement, PlanDefinition } from "@/lib/plans";

const ENTITLEMENT_LABELS: Partial<Record<Entitlement, string>> = {
  catalog: "Catálogo de livros",
  clients: "Cadastro de clientes",
  orders: "Pedidos e vendas",
  reports_basic: "Relatórios essenciais",
  reports_advanced: "Relatórios avançados",
  store_whatsapp: "Loja no WhatsApp",
  store_pix: "Cobrança Pix",
  ai_pricing: "Sugestão de preço com IA",
};

type Props = {
  plans: PlanDefinition[];
  defaultPlanCode?: string;
};

function formatPrice(value: number | null) {
  if (value === null) return "Sob consulta";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function stockLabel(plan: PlanDefinition) {
  if (plan.maxBooks === null) return "Livros ilimitados";
  return `Até ${plan.maxBooks.toLocaleString("pt-BR")} livros`;
}

export function PlanPicker({ plans, defaultPlanCode }: Props) {
  const initial =
    plans.find((p) => p.code === defaultPlanCode)?.code ||
    plans.find((p) => p.code === "business_profissional")?.code ||
    plans[0]?.code;

  const [selected, setSelected] = useState(initial);

  const plan = useMemo(
    () => plans.find((p) => p.code === selected) ?? plans[0],
    [plans, selected],
  );

  if (!plan) return null;

  const features = plan.entitlements
    .map((e) => ENTITLEMENT_LABELS[e])
    .filter(Boolean) as string[];

  return (
    <div className="plan-picker">
      <div className="plan-picker__tabs" role="tablist" aria-label="Planos Negócio">
        {plans.map((p) => {
          const active = p.code === plan.code;
          return (
            <button
              key={p.code}
              type="button"
              role="tab"
              aria-selected={active}
              className="plan-picker__tab"
              onClick={() => setSelected(p.code)}
            >
              <span className="plan-picker__tab-name">{p.name}</span>
              <span className="plan-picker__tab-price">
                {formatPrice(p.priceMonthlyBrl)}
                <span style={{ fontWeight: 500, opacity: 0.75 }}>/mês</span>
              </span>
              <span className="plan-picker__tab-meta">{stockLabel(p)}</span>
            </button>
          );
        })}
      </div>

      <div
        key={plan.code}
        className="plan-picker__detail"
        role="tabpanel"
        aria-label={plan.name}
      >
        <h3 className="plan-picker__detail-title">{plan.name}</h3>
        <p className="plan-picker__detail-price">
          {formatPrice(plan.priceMonthlyBrl)}
          <span> /mês · trial 14 dias</span>
        </p>
        <ul className="plan-picker__features">
          <li>{stockLabel(plan)}</li>
          {features.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div className="plan-picker__cta">
          <Link
            href={`/cadastro?plano=${plan.code}`}
            className="landing-btn landing-btn--primary"
          >
            Começar 14 dias grátis — {plan.name}
          </Link>
        </div>
      </div>
    </div>
  );
}
