import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { markOverdueLoans } from "@/lib/library/actions";
import {
  getTenantLibraryPolicy,
  listOpenLoans,
} from "@/lib/library/queries";
import { CirculationDesk } from "./desk";
import "../livros/livros.css";

export const dynamic = "force-dynamic";

export default async function CirculacaoPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/circulacao");
  if (
    ctx.tenant.product !== "library" ||
    !hasEntitlement(ctx.tenant.planCode, "lending")
  ) {
    redirect("/painel");
  }

  await markOverdueLoans(ctx.tenant.id);
  const [loans, policy] = await Promise.all([
    listOpenLoans(ctx.tenant.id),
    getTenantLibraryPolicy(ctx.tenant.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Circulação</h1>
      <p className="mt-1 text-sm text-muted">
        Emprestar, devolver e renovar no balcão: leitor, livro, confirmar.
      </p>
      <div className="mt-6">
        <CirculationDesk initialLoans={loans} policy={policy} />
      </div>
    </div>
  );
}
