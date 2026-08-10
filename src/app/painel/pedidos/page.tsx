import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import {
  listOrders,
  orderStatusCounters,
  ORDER_STATUSES,
} from "@/lib/orders/queries";
import "./pedidos.css";

function money(v: string | number | null) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function statusStyle(status: string): { bg: string; color: string } {
  switch (status) {
    case "Aguardando Pagamento":
      return { bg: "#fef3c7", color: "#92400e" };
    case "Pago":
      return { bg: "#dbeafe", color: "#1e40af" };
    case "Enviado":
      return { bg: "#e0f2fe", color: "#075985" };
    case "Entregue":
      return { bg: "#dcfce7", color: "#166534" };
    case "Cancelado":
      return { bg: "#fee2e2", color: "#991b1b" };
    default:
      return { bg: "#f5f5f4", color: "#44403c" };
  }
}

function buildHref(
  base: Record<string, string>,
  overrides: Record<string, string | undefined>,
) {
  const p = new URLSearchParams();
  const merged = { ...base, ...overrides };
  Object.entries(merged).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `/painel/pedidos?${s}` : "/painel/pedidos";
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/pedidos");
  if (!hasEntitlement(ctx.tenant.planCode, "orders")) {
    return (
      <div className="pedidos-page">
        <h1 className="text-2xl font-semibold text-ink">Pedidos</h1>
        <p className="mt-3 text-sm text-muted">
          Seu plano não inclui o módulo de pedidos.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const status = sp.status?.trim() || "";
  const busca = sp.busca?.trim() || "";
  const dataIni = sp.data_ini?.trim() || "";
  const dataFim = sp.data_fim?.trim() || "";

  const baseParams: Record<string, string> = {};
  if (status) baseParams.status = status;
  if (busca) baseParams.busca = busca;
  if (dataIni) baseParams.data_ini = dataIni;
  if (dataFim) baseParams.data_fim = dataFim;

  const [rows, counters] = await Promise.all([
    listOrders(ctx.tenant.id, {
      status,
      busca,
      dataIni,
      dataFim,
    }),
    orderStatusCounters(ctx.tenant.id),
  ]);

  return (
    <div className="pedidos-page">
      <div className="page-header">
        <div>
          <h4>Pedidos</h4>
          <small style={{ color: "var(--muted)" }}>
            {rows.length} pedido(s) encontrado(s)
          </small>
        </div>
        <Link href="/painel/pedidos/novo" className="btn-accent">
          + Novo Pedido
        </Link>
      </div>

      <div className="status-chips">
        <Link
          href={buildHref(baseParams, { status: undefined })}
          className={`chip${!status ? " active" : ""}`}
        >
          Todos <span className="n">{counters.__total ?? 0}</span>
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref(baseParams, { status: s })}
            className={`chip${status === s ? " active" : ""}`}
          >
            {s} <span className="n">{counters[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginBottom: "0.85rem" }}>
        <div className="card-body" style={{ padding: "0.65rem 1rem" }}>
          <form method="GET" className="filters-row">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <input
              type="search"
              name="busca"
              className="form-control"
              defaultValue={busca}
              placeholder="Nome do cliente ou nº pedido"
              style={{ maxWidth: 280 }}
            />
            <input
              type="date"
              name="data_ini"
              className="form-control"
              defaultValue={dataIni}
              style={{ maxWidth: 160 }}
            />
            <input
              type="date"
              name="data_fim"
              className="form-control"
              defaultValue={dataFim}
              style={{ maxWidth: 160 }}
            />
            <button type="submit" className="btn-accent">
              Filtrar
            </button>
            {busca || dataIni || dataFim ? (
              <Link
                href={status ? `/painel/pedidos?status=${encodeURIComponent(status)}` : "/painel/pedidos"}
                className="btn-outline"
              >
                Limpar
              </Link>
            ) : null}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: "center" }}>Livros</th>
                  <th>Pagamento</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      Nenhum pedido encontrado
                    </td>
                  </tr>
                ) : (
                  rows.map((o) => {
                    const st = statusStyle(o.status);
                    return (
                      <tr key={o.id}>
                        <td>
                          <Link
                            href={`/painel/pedidos/${o.id}`}
                            style={{
                              fontWeight: 600,
                              color: "var(--accent)",
                              textDecoration: "none",
                            }}
                          >
                            #{shortId(o.id)}
                          </Link>
                        </td>
                        <td>
                          {o.orderDate.toLocaleDateString("pt-BR")}
                        </td>
                        <td>
                          <Link
                            href={`/painel/clientes/${o.clientId}`}
                            style={{
                              color: "inherit",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {o.clientName}
                          </Link>
                        </td>
                        <td style={{ textAlign: "center" }}>{o.itemCount}</td>
                        <td style={{ fontSize: "0.82rem" }}>
                          {o.paymentMethod}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {money(o.totalAmount)}
                        </td>
                        <td>
                          <span
                            className="badge-status"
                            style={{ background: st.bg, color: st.color }}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <Link
                            href={`/painel/pedidos/${o.id}`}
                            className="btn-outline btn-sm"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
