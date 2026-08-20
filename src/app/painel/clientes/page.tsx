import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { listClients } from "@/lib/clients/queries";
import { DeleteClientButton } from "./delete-client-button";
import "./clientes.css";

function money(v: string | number) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function waHref(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/clientes");
  if (!hasEntitlement(ctx.tenant.planCode, "clients")) {
    return (
      <div className="clientes-page">
        <h1 className="text-2xl font-semibold text-ink">Clientes</h1>
        <p className="mt-3 text-sm text-muted">
          Seu plano não inclui o cadastro de clientes.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const isLibrary = ctx.tenant.product === "library";
  const busca = sp.busca?.trim() || "";
  const rows = await listClients(ctx.tenant.id, { busca });

  return (
    <div className="clientes-page">
      <div className="page-header">
        <div>
          <h4>{isLibrary ? "Leitores" : "Clientes"}</h4>
          <small style={{ color: "var(--muted)" }}>
            {rows.length} {isLibrary ? "leitor(es)" : "cliente(s)"}
          </small>
        </div>
        <Link href="/painel/clientes/novo" className="btn-accent">
          {isLibrary ? "+ Novo leitor" : "+ Novo Cliente"}
        </Link>
      </div>

      <div className="card" style={{ marginBottom: "0.85rem" }}>
        <div className="card-body" style={{ padding: "0.65rem 1rem" }}>
          <form method="GET" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="search"
              name="busca"
              className="form-control"
              defaultValue={busca}
              placeholder="Nome, e-mail, WhatsApp, cidade…"
              style={{ maxWidth: 400 }}
            />
            <button type="submit" className="btn-accent">
              Filtrar
            </button>
            {busca ? (
              <Link href="/painel/clientes" className="btn-outline">
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
                  <th>Nome</th>
                  <th>WhatsApp</th>
                  <th>E-mail</th>
                  <th>Cidade / UF</th>
                  {isLibrary ? (
                    <th style={{ textAlign: "center" }}>Cadastro</th>
                  ) : (
                    <>
                      <th style={{ textAlign: "center" }}>Pedidos</th>
                      <th style={{ textAlign: "right" }}>Total Gasto</th>
                    </>
                  )}
                  <th style={{ textAlign: "center" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={isLibrary ? 6 : 7} className="empty">
                      {isLibrary
                        ? "Nenhum leitor encontrado"
                        : "Nenhum cliente encontrado"}
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.cpf ? (
                          <small style={{ color: "var(--muted)" }}>{c.cpf}</small>
                        ) : null}
                      </td>
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
                      <td style={{ fontSize: "0.82rem" }}>{c.email || "—"}</td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {c.city
                          ? `${c.city}${c.state ? ` / ${c.state}` : ""}`
                          : "—"}
                      </td>
                      {isLibrary ? (
                        <td style={{ textAlign: "center" }}>
                          <span className="badge">
                            {c.createdAt.toLocaleDateString("pt-BR")}
                          </span>
                        </td>
                      ) : (
                        <>
                      <td style={{ textAlign: "center" }}>
                        <span className="badge">{c.totalOrders}</span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {money(c.totalSpent)}
                      </td>
                        </>
                      )}
                      <td>
                        <div className="actions">
                          <Link
                            href={`/painel/clientes/${c.id}`}
                            className="btn-outline btn-sm"
                            title="Ver"
                          >
                            Ver
                          </Link>
                          <Link
                            href={`/painel/clientes/${c.id}/editar`}
                            className="btn-outline btn-sm"
                            title="Editar"
                          >
                            Editar
                          </Link>
                          <DeleteClientButton
                            id={c.id}
                            name={c.name}
                            orderCount={c.totalOrders}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
