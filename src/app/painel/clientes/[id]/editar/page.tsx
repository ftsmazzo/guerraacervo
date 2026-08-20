import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getClient } from "@/lib/clients/queries";
import { ClientForm } from "../../client-form";
import "../../clientes.css";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/clientes");
  if (!hasEntitlement(ctx.tenant.planCode, "clients")) {
    redirect("/painel/clientes");
  }

  const { id } = await params;
  const client = await getClient(ctx.tenant.id, id);
  if (!client) notFound();

  return (
    <ClientForm
      initial={client}
      library={ctx.tenant.product === "library"}
    />
  );
}
