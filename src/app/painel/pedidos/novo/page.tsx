import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { listClientsForOrder } from "@/lib/orders/queries";
import { OrderForm } from "../order-form";
import "../pedidos.css";

export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/pedidos/novo");
  if (!hasEntitlement(ctx.tenant.planCode, "orders")) {
    redirect("/painel/pedidos");
  }

  const sp = await searchParams;
  const clients = await listClientsForOrder(ctx.tenant.id);

  return (
    <OrderForm
      clients={clients}
      preselectedClientId={sp.cliente_id}
    />
  );
}
