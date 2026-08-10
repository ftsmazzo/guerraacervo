import { getPlan, type Entitlement } from "@/lib/plans";
import { hasEntitlement } from "@/lib/auth/context";

export function EntitlementGate({
  planCode,
  entitlement,
  title,
  children,
}: {
  planCode: string | null | undefined;
  entitlement: Entitlement | Entitlement[];
  title: string;
  children?: React.ReactNode;
}) {
  const ok = Array.isArray(entitlement)
    ? entitlement.some((e) => hasEntitlement(planCode, e))
    : hasEntitlement(planCode, entitlement);

  if (ok) return <>{children}</>;

  const plan = planCode ? getPlan(planCode) : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-6 rounded-lg border border-line bg-card p-6 text-sm text-muted">
        Seu plano atual
        {plan ? (
          <>
            {" "}
            (<span className="font-medium text-ink">{plan.name}</span>)
          </>
        ) : null}{" "}
        não inclui este módulo. Faça upgrade para liberar.
      </div>
    </div>
  );
}
