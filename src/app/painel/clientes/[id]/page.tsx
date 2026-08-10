import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getClient } from "@/lib/clients/queries";
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
          <span
            className="btn-accent"
            style={{ opacity: 0.55, cursor: "not-allowed" }}
            title="Em breve"
          >
            Novo Pedido (em breve)
          </span>
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
        <div className="alert-soon">
          O módulo de Pedidos chega no próximo sprint. Por enquanto, o histórico
          aparece aqui assim que houver pedidos cadastrados —{" "}
          <Link href="/painel/pedidos" style={{ color: "inherit", fontWeight: 600 }}>
            em breve
          </Link>
          .
        </div>
        <div className="card-body p-0">
          <div className="empty" style={{ paddingTop: "1rem" }}>
            Nenhum pedido encontrado
          </div>
        </div>
      </div>
    </div>
  );
}
