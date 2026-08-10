import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getClient } from "@/lib/clients/queries";
import { listOrdersByClient } from "@/lib/orders/queries";
import "../clientes.css";

function money(v: string | number) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPeso(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(2).replace(".", ",")} kg`;
  return `${g} g`;
}

function waHref(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
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

export default async function ClienteViewPage({
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
  const c = await getClient(ctx.tenant.id, id);
  if (!c) notFound();

  const canOrders = hasEntitlement(ctx.tenant.planCode, "orders");
  const pedidos = canOrders
    ? await listOrdersByClient(ctx.tenant.id, id)
    : [];

  const cityUf =
    c.city || c.state
      ? `${c.city || ""}${c.city && c.state ? "/" : ""}${c.state || ""}`
      : null;
  const addressParts = [
    c.street ? `${c.street}, ${c.number || "s/n"}` : null,
    c.complement || null,
    c.district || null,
    cityUf,
    c.cep ? `CEP: ${c.cep}` : null,
  ].filter(Boolean);

  return (
    <div className="clientes-page">
      <div className="page-header">
        <div>
          <h4>{c.name}</h4>
          <p className="breadcrumb">
            <Link href="/painel/clientes">Clientes</Link>
            {" / Perfil"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href={`/painel/clientes/${c.id}/editar`} className="btn-outline">
            Editar
          </Link>
          {canOrders ? (
            <Link
              href={`/painel/pedidos/novo?cliente_id=${c.id}`}
              className="btn-accent"
            >
              Novo Pedido
            </Link>
          ) : null}
        </div>
      </div>

      <div className="profile-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title-icon">●</span> Dados do Cliente
          </div>
          <div className="card-body">
            <table className="dl">
              <tbody>
                <tr>
                  <td>CPF</td>
                  <td>{c.cpf || "—"}</td>
                </tr>
                <tr>
                  <td>WhatsApp</td>
                  <td>
                    {c.whatsapp ? (
                      <a
                        href={waHref(c.whatsapp)}
                        target="_blank"
                        rel="noreferrer"
                        className="wa-link"
                      >
                        {c.whatsapp}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                <tr>
                  <td>E-mail</td>
                  <td style={{ fontSize: "0.82rem" }}>{c.email || "—"}</td>
                </tr>
                {addressParts.length ? (
                  <tr>
                    <td>Endereço</td>
                    <td style={{ fontSize: "0.82rem" }}>
                      {addressParts.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </td>
                  </tr>
                ) : null}
                {c.notes ? (
                  <tr>
                    <td>Obs.</td>
                    <td style={{ fontSize: "0.82rem" }}>{c.notes}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stat-grid">
          <div className="card stat-card">
            <div className="stat-val">{c.totalOrders}</div>
            <div className="stat-lbl">Total de Pedidos</div>
          </div>
          <div className="card stat-card">
            <div className="stat-val accent">{money(c.totalSpent)}</div>
            <div className="stat-lbl">Total Gasto</div>
          </div>
          <div className="card stat-card">
            <div className="stat-val">{formatPeso(c.totalWeight)}</div>
            <div className="stat-lbl">Peso Total Enviado</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title-icon">●</span> Histórico de Pedidos
        </div>
        <div className="card-body p-0">
          {!canOrders ? (
            <div className="empty">Plano sem módulo de pedidos.</div>
          ) : pedidos.length === 0 ? (
            <div className="empty">Nenhum pedido encontrado</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Data</th>
                    <th style={{ textAlign: "center" }}>Livros</th>
                    <th>Pagamento</th>
                    <th style={{ textAlign: "end" }}>Valor</th>
                    <th>Status</th>
                    <th style={{ textAlign: "center" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => {
                    const st = statusStyle(p.status);
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link
                            href={`/painel/pedidos/${p.id}`}
                            style={{
                              fontWeight: 600,
                              color: "var(--accent)",
                              textDecoration: "none",
                            }}
                          >
                            #{shortId(p.id)}
                          </Link>
                        </td>
                        <td>{p.orderDate.toLocaleDateString("pt-BR")}</td>
                        <td style={{ textAlign: "center" }}>
                          <span className="badge">{p.itemCount}</span>
                        </td>
                        <td style={{ fontSize: "0.82rem" }}>
                          {p.paymentMethod}
                        </td>
                        <td style={{ textAlign: "end", fontWeight: 600 }}>
                          {money(p.totalAmount ?? 0)}
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.15rem 0.45rem",
                              borderRadius: 999,
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              background: st.bg,
                              color: st.color,
                            }}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <Link
                            href={`/painel/pedidos/${p.id}`}
                            className="btn-outline btn-sm"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
