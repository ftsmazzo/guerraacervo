import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { ClientForm } from "../client-form";
import "../clientes.css";

export default async function NovoClientePage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/clientes/novo");
  if (!hasEntitlement(ctx.tenant.planCode, "clients")) {
    redirect("/painel/clientes");
  }

  return <ClientForm />;
}
