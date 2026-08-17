import Link from "next/link";
import { redirect } from "next/navigation";
import { PushAlertsCard } from "@/components/push-enable-button";
import { ReadingPlanForm } from "@/components/reading/reading-ui";
import { getAuthContext } from "@/lib/auth/context";
import { getReadingPlan, pagesReadOn } from "@/lib/reading/queries";
import { todayInTimeZone } from "@/lib/reading/types";

export const dynamic = "force-dynamic";

export default async function LeituraPlanoPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/leitura");
  if (ctx.tenant.product !== "personal") redirect("/painel");

  const plan = await getReadingPlan(ctx.tenant.id);
  const tz = plan?.timezone || "America/Sao_Paulo";
  const today = todayInTimeZone(tz);
  const todayPages = await pagesReadOn(ctx.tenant.id, today);
  const goal = plan?.dailyPages ?? 20;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink">Plano de leitura</h1>
      <p className="mt-1 text-sm text-muted">
        Meta de páginas por dia e um toque no celular se o dia passar em branco.
      </p>

      <div className="mt-5 rounded-lg border border-line bg-card p-4">
        <p className="text-xs text-muted">Hoje</p>
        <p className="mt-1 text-2xl font-semibold text-ink">
          {todayPages} / {goal} páginas
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.round((todayPages / goal) * 100))}%` }}
          />
        </div>
      </div>

      <ReadingPlanForm
        dailyPages={goal}
        remindAt={plan?.remindAt ?? "21:00"}
        enabled={plan?.enabled ?? true}
      />

      <div className="mt-8">
        <PushAlertsCard variant="card" kind="leitura" />
      </div>

      <p className="mt-4 text-sm text-muted">
        Marque as páginas na{" "}
        <Link href="/painel/livros" className="text-accent-text underline">
          estante
        </Link>{" "}
        ou no início.
      </p>
    </div>
  );
}
