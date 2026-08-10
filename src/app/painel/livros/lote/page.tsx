import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { BatchPhotoForm } from "./batch-photo-form";
import "../livros.css";

export default async function LoteFotoPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/livros/lote");
  if (!hasEntitlement(ctx.tenant.planCode, "catalog")) {
    redirect("/painel/livros");
  }

  return (
    <div className="livros-page">
      <div className="page-header">
        <div>
          <h4>Foto da mesa</h4>
          <small className="text-muted">
            Tire uma foto com vários livros → revise → salve o lote
          </small>
        </div>
        <Link href="/painel/livros" className="btn-accent" style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}>
          ← Voltar
        </Link>
      </div>
      <BatchPhotoForm />
    </div>
  );
}
