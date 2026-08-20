import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { BookForm } from "../book-form";
import "../livros.css";

export default async function NovoLivroPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/livros/novo");
  if (!hasEntitlement(ctx.tenant.planCode, "catalog")) {
    redirect("/painel/livros");
  }

  return <BookForm personal={ctx.tenant.product === "personal"} library={ctx.tenant.product === "library"} />;
}
