import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getOrder } from "@/lib/orders/queries";
import { UpdateStatusForm } from "../update-status-form";
import "../pedidos.css";

function money(v: string | number | null) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPeso(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(2).replace(".", ",")} kg`;
  return `${g} g`;
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

function waHref(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export default async function PedidoViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/pedidos");
  if (!hasEntitlement(ctx.tenant.planCode, "orders")) {
    redirect("/painel/pedidos");
  }

  const { id } = await params;
  const o = await getOrder(ctx.tenant.id, id);
  if (!o) notFound();

  const st = statusStyle(o.status);
  const address = [
    o.clientStreet
      ? `${o.clientStreet}, ${o.clientNumber || "s/n"}`
      : null,
    o.clientComplement,
    o.clientDistrict,
    o.clientCity || o.clientState
      ? `${o.clientCity || ""}${o.clientCity && o.clientState ? "/" : ""}${o.clientState || ""}`
      : null,
    o.clientCep ? `CEP: ${o.clientCep}` : null,
  ].filter(Boolean);

  return (
    <div className="pedidos-page">
      <div className="page-header">
        <div>
          <h4>Pedido #{shortId(o.id)}</h4>
          <p className="breadcrumb">
            <Link href="/painel/pedidos">Pedidos</Link>
            {` / #${shortId(o.id)}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span
            className="badge-status"
            style={{ background: st.bg, color: st.color }}
          >
            {o.status}
          </span>
          <Link href="/painel/pedidos" className="btn-outline">
            Voltar
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div className="card-header">
              <span className="card-title-icon">●</span> Informações do Pedido
            </div>
            <div className="card-body">
              <div className="info-grid">
                <div>
                  <div className="info-lbl">Data do Pedido</div>
                  <div className="info-val">
                    {o.orderDate.toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div>
                  <div className="info-lbl">Forma de Pagamento</div>
                  <div className="info-val">{o.paymentMethod}</div>
                </div>
                <div>
                  <div className="info-lbl">Peso Total</div>
                  <div className="info-val" style={{ color: "var(--accent)" }}>
                    {formatPeso(o.totalWeight ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="info-lbl">Valor Total</div>
                  <div className="info-val" style={{ color: "var(--accent)" }}>
                    {money(o.totalAmount)}
                  </div>
                </div>
              </div>
              {o.trackingCode ? (
                <div style={{ marginTop: "0.85rem" }}>
                  <div className="info-lbl">Código de Rastreio</div>
                  <div className="info-val" style={{ fontFamily: "monospace" }}>
                    {o.trackingCode}{" "}
                    <a
                      href="https://rastreamento.correios.com.br/app/index.php"
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "0.8rem" }}
                    >
                      Correios
                    </a>
                  </div>
                </div>
              ) : null}
              {o.notes ? (
                <div style={{ marginTop: "0.85rem" }}>
                  <div className="info-lbl">Observações</div>
                  <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    {o.notes}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title-icon">●</span> Livros do Pedido
            </div>
            <div className="card-body p-0">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}></th>
                      <th>Título</th>
                      <th>Estado</th>
                      <th>Local</th>
                      <th style={{ textAlign: "end" }}>Peso</th>
                      <th style={{ textAlign: "center" }}>Qtd</th>
                      <th style={{ textAlign: "end" }}>Unit.</th>
                      <th style={{ textAlign: "end" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="cart-cover"
                            />
                          ) : (
                            <div className="cart-cover" />
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.title}</div>
                          {item.author ? (
                            <small style={{ color: "var(--muted)" }}>
                              {item.author}
                            </small>
                          ) : null}
                        </td>
                        <td style={{ fontSize: "0.82rem" }}>{item.condition}</td>
                        <td style={{ fontSize: "0.82rem" }}>
                          {item.location || "—"}
                        </td>
                        <td style={{ textAlign: "end" }}>
                          {formatPeso((item.weightGrams ?? 0) * item.quantity)}
                        </td>
                        <td style={{ textAlign: "center" }}>{item.quantity}</td>
                        <td style={{ textAlign: "end" }}>
                          {money(item.unitPrice)}
                        </td>
                        <td style={{ textAlign: "end", fontWeight: 600 }}>
                          {money(Number(item.unitPrice) * item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div className="card-header">
              <span className="card-title-icon">●</span> Cliente
            </div>
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
                <Link
                  href={`/painel/clientes/${o.clientId}`}
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                >
                  {o.clientName}
                </Link>
              </div>
              {o.clientWhatsapp ? (
                <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                  <a
                    href={waHref(o.clientWhatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#15803d", textDecoration: "none" }}
                  >
                    WhatsApp {o.clientWhatsapp}
                  </a>
                </div>
              ) : null}
              {o.clientEmail ? (
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--muted)",
                    marginBottom: "0.35rem",
                  }}
                >
                  {o.clientEmail}
                </div>
              ) : null}
              {address.length ? (
                <div style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>
                  {address.map((line) => (
                    <div key={String(line)}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title-icon">●</span> Atualizar Status
            </div>
            <div className="card-body">
              <UpdateStatusForm
                orderId={o.id}
                currentStatus={o.status}
                currentTracking={o.trackingCode}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
