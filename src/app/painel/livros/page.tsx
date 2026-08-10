import { getAuthContext } from "@/lib/auth/context";
import { EntitlementGate } from "@/components/entitlement-gate";
import { canAddBook } from "@/lib/tenant-limits";

export default async function LivrosPage() {
  const ctx = await getAuthContext();
  const planCode = ctx?.tenant?.planCode;
  const limit =
    ctx?.tenant &&
    (await canAddBook(ctx.tenant.id, ctx.tenant.planCode));

  return (
    <EntitlementGate
      planCode={planCode}
      entitlement="catalog"
      title="Livros"
    >
      <div>
        <h1 className="text-2xl font-semibold text-ink">Livros</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Catálogo com ISBN, estoque, conservação e limite por plano.
        </p>
        {limit ? (
          <p className="mt-3 text-sm text-muted">
            Uso do plano:{" "}
            <span className="font-medium text-ink">
              {limit.current}
              {limit.max === null ? "" : ` / ${limit.max}`}
            </span>{" "}
            livros
            {!limit.ok ? (
              <span className="text-accent-text"> · limite atingido</span>
            ) : null}
          </p>
        ) : null}
        <div className="mt-6 rounded-lg border border-dashed border-line bg-card p-8 text-sm text-muted">
          Módulo stub — CRUD vem na próxima etapa, já sujeito a{" "}
          <code className="rounded bg-accent-soft px-1.5 py-0.5 text-accent-text">
            canAddBook()
          </code>
          .
        </div>
      </div>
    </EntitlementGate>
  );
}
