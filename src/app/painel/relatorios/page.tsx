import Link from "next/link";
import { redirect } from "next/navigation";
import { EntitlementGate } from "@/components/entitlement-gate";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/orders/constants";
import { resolveReportPeriod } from "@/lib/reports/period";
import {
  dailyRevenueSeries,
  getReportKpis,
  listSalesReport,
  listStockReport,
  paymentBreakdown,
  rankClients,
  statusBreakdown,
  topBooksSold,
} from "@/lib/reports/queries";
import "./relatorios.css";

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortDay(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function statusPill(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    "Aguardando Pagamento": { bg: "#fef3c7", color: "#92400e" },
    Pago: { bg: "#dbeafe", color: "#1e40af" },
    Enviado: { bg: "#e0f2fe", color: "#075985" },
    Entregue: { bg: "#dcfce7", color: "#166534" },
    Cancelado: { bg: "#fee2e2", color: "#991b1b" },
  };
  const s = map[status] || { bg: "#f5f5f4", color: "#44403c" };
  return (
    <span className="pill" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
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
  return s ? `/painel/relatorios?${s}` : "/painel/relatorios";
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/relatorios");

  const sp = await searchParams;
  const period = resolveReportPeriod({
    data_ini: sp.data_ini,
    data_fim: sp.data_fim,
    periodo: sp.periodo,
  });
  const status = sp.status || "";
  const pagamento = sp.pagamento || "";
  const advanced = hasEntitlement(ctx.tenant.planCode, "reports_advanced");
  const canReports = hasEntitlement(ctx.tenant.planCode, "reports_basic");

  if (!canReports) {
    return (
      <EntitlementGate
        planCode={ctx.tenant.planCode}
        entitlement="reports_basic"
        title="Relatórios"
      />
    );
  }

  const baseParams: Record<string, string> = {
    data_ini: period.dataIni,
    data_fim: period.dataFim,
    periodo: period.preset,
  };
  if (status) baseParams.status = status;
  if (pagamento) baseParams.pagamento = pagamento;

  const filterKeep: Record<string, string> = {};
  if (status) filterKeep.status = status;
  if (pagamento) filterKeep.pagamento = pagamento;

  return (
    <div className="relatorios-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Relatórios</h1>
          <p className="mt-1 text-sm text-muted">
            KPIs do período · vendas · estoque · exportação CSV
          </p>
        </div>
      </div>

      <form className="filters" method="get">
        <input type="hidden" name="periodo" value="custom" />
        <label>
          De
          <input type="date" name="data_ini" defaultValue={period.dataIni} />
        </label>
        <label>
          Até
          <input type="date" name="data_fim" defaultValue={period.dataFim} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="">Pagos (padrão)</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pagamento
          <select name="pagamento" defaultValue={pagamento}>
            <option value="">Todos</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="submit" className="btn btn-accent">
            Filtrar
          </button>
          <Link
            href={buildHref(filterKeep, { periodo: "7d" })}
            className={`btn btn-ghost ${period.preset === "7d" ? "is-active" : ""}`}
          >
            7 dias
          </Link>
          <Link
            href={buildHref(filterKeep, { periodo: "mes" })}
            className={`btn btn-ghost ${period.preset === "mes" ? "is-active" : ""}`}
          >
            Mês
          </Link>
          <Link
            href={buildHref(filterKeep, { periodo: "mes_ant" })}
            className={`btn btn-ghost ${period.preset === "mes_ant" ? "is-active" : ""}`}
          >
            Mês ant.
          </Link>
          <Link
            href={buildHref(filterKeep, { periodo: "ano" })}
            className={`btn btn-ghost ${period.preset === "ano" ? "is-active" : ""}`}
          >
            Ano
          </Link>
        </div>
      </form>

      <ReportBody
        tenantId={ctx.tenant.id}
        dataIni={period.dataIni}
        dataFim={period.dataFim}
        status={status}
        pagamento={pagamento}
        advanced={advanced}
        exportQuery={new URLSearchParams(baseParams).toString()}
      />
    </div>
  );
}

async function ReportBody({
  tenantId,
  dataIni,
  dataFim,
  status,
  pagamento,
  advanced,
  exportQuery,
}: {
  tenantId: string;
  dataIni: string;
  dataFim: string;
  status: string;
  pagamento: string;
  advanced: boolean;
  exportQuery: string;
}) {
  const [kpis, sales, payments, statuses, topBooks, daily, stock, topSpend, topActive, topRecent] =
    await Promise.all([
      getReportKpis(tenantId, dataIni, dataFim),
      listSalesReport(tenantId, dataIni, dataFim, {
        status: status || undefined,
        paymentMethod: pagamento || undefined,
      }),
      paymentBreakdown(tenantId, dataIni, dataFim),
      statusBreakdown(tenantId, dataIni, dataFim),
      topBooksSold(tenantId, dataIni, dataFim, advanced ? 15 : 8),
      advanced
        ? dailyRevenueSeries(tenantId, dataIni, dataFim)
        : Promise.resolve([]),
      listStockReport(tenantId),
      rankClients(tenantId, dataIni, dataFim, "spent", advanced ? 15 : 10),
      rankClients(tenantId, dataIni, dataFim, "orders", advanced ? 15 : 10),
      rankClients(tenantId, dataIni, dataFim, "recency", advanced ? 15 : 10),
    ]);

  const maxDaily = Math.max(1, ...daily.map((d) => d.total));
  const lowStock = stock.filter((s) => s.available <= 0).slice(0, 12);

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi kpi-green">
          <div className="kpi-label">Receita</div>
          <div className="kpi-value">{money(kpis.receita)}</div>
          <div className="kpi-hint">Pago / Enviado / Entregue</div>
        </div>
        <div className="kpi kpi-blue">
          <div className="kpi-label">Pedidos pagos</div>
          <div className="kpi-value">{kpis.pedidosPagos}</div>
          <div className="kpi-hint">Ticket médio {money(kpis.ticketMedio)}</div>
        </div>
        <div className="kpi kpi-orange">
          <div className="kpi-label">Livros vendidos</div>
          <div className="kpi-value">{kpis.livrosVendidos}</div>
          <div className="kpi-hint">Unidades no período</div>
        </div>
        <div className="kpi kpi-amber">
          <div className="kpi-label">Aguardando Pix</div>
          <div className="kpi-value">{kpis.aguardandoPagamento}</div>
          <div className="kpi-hint">{money(kpis.valorReservado)} reservado</div>
        </div>
        <div className="kpi kpi-teal">
          <div className="kpi-label">Títulos no catálogo</div>
          <div className="kpi-value">{kpis.titulosCatalogo}</div>
          <div className="kpi-hint">{kpis.semEstoque} sem estoque</div>
        </div>
        <div className="kpi kpi-slate">
          <div className="kpi-label">Estoque físico</div>
          <div className="kpi-value">{kpis.unidadesEstoque}</div>
          <div className="kpi-hint">
            {kpis.unidadesDisponiveis} disponíveis
          </div>
        </div>
        <div className="kpi kpi-violet">
          <div className="kpi-label">Reservados</div>
          <div className="kpi-value">{kpis.unidadesReservadas}</div>
          <div className="kpi-hint">Aguardando pagamento</div>
        </div>
        <div className="kpi kpi-rose">
          <div className="kpi-label">Disponíveis</div>
          <div className="kpi-value">{kpis.unidadesDisponiveis}</div>
          <div className="kpi-hint">Prontos pra vender</div>
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-h">
            <h2>Por forma de pagamento</h2>
          </div>
          <div className="panel-b table-wrap">
            {payments.length === 0 ? (
              <p className="empty">Sem vendas no período.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.paymentMethod}>
                      <td>{p.paymentMethod}</td>
                      <td className="num">{p.count}</td>
                      <td className="num">{money(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>Pedidos por status</h2>
          </div>
          <div className="panel-b table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th className="num">Qtd</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => (
                  <tr key={s.status}>
                    <td>{statusPill(s.status)}</td>
                    <td className="num">{s.count}</td>
                    <td className="num">{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {advanced && daily.length > 0 ? (
        <div className="panel">
          <div className="panel-h">
            <h2>Receita por dia</h2>
          </div>
          <div className="panel-b">
            <div className="bars" aria-label="Gráfico de receita diária">
              {daily.map((d) => (
                <div key={d.day} className="bar-col" title={`${d.day}: ${money(d.total)}`}>
                  <div
                    className="bar"
                    style={{ height: `${Math.max(4, (d.total / maxDaily) * 100)}%` }}
                  />
                  <span className="bar-label">{shortDay(d.day)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-h">
          <h2>Mais vendidos</h2>
        </div>
        <div className="panel-b table-wrap">
          {topBooks.length === 0 ? (
            <p className="empty">Nenhum livro vendido no período.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Livro</th>
                  <th className="num">Qtd</th>
                  <th className="num">Receita</th>
                </tr>
              </thead>
              <tbody>
                {topBooks.map((b) => (
                  <tr key={b.bookId}>
                    <td>
                      <Link
                        href={`/painel/livros/${b.bookId}`}
                        className="font-medium text-ink hover:text-accent-text"
                      >
                        {b.title}
                      </Link>
                      {b.author ? (
                        <div className="text-xs text-muted">{b.author}</div>
                      ) : null}
                    </td>
                    <td className="num">{b.qty}</td>
                    <td className="num">{money(b.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-h">
            <h2>Melhores clientes</h2>
            <a
              className="btn btn-ghost"
              href={`/api/painel/reports/export?tipo=clientes&sort=spent&${exportQuery}`}
            >
              CSV
            </a>
          </div>
          <div className="panel-b table-wrap">
            {topSpend.length === 0 ? (
              <p className="empty">Sem compras no período.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {topSpend.map((c) => (
                    <tr key={c.clientId}>
                      <td>
                        <Link
                          href={`/painel/clientes/${c.clientId}`}
                          className="font-medium text-ink hover:text-accent-text"
                        >
                          {c.name}
                        </Link>
                        {c.whatsapp ? (
                          <div className="text-xs text-muted">{c.whatsapp}</div>
                        ) : null}
                      </td>
                      <td className="num">{c.orders}</td>
                      <td className="num">{money(c.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>Mais ativos</h2>
            <a
              className="btn btn-ghost"
              href={`/api/painel/reports/export?tipo=clientes&sort=orders&${exportQuery}`}
            >
              CSV
            </a>
          </div>
          <div className="panel-b table-wrap">
            {topActive.length === 0 ? (
              <p className="empty">Sem compras no período.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Livros</th>
                    <th className="num">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {topActive.map((c) => (
                    <tr key={c.clientId}>
                      <td>
                        <Link href={`/painel/clientes/${c.clientId}`}>
                          {c.name}
                        </Link>
                      </td>
                      <td className="num">{c.orders}</td>
                      <td className="num">{c.books}</td>
                      <td className="num">{money(c.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Compraram recentemente</h2>
          <a
            className="btn btn-ghost"
            href={`/api/painel/reports/export?tipo=clientes&sort=recency&${exportQuery}`}
          >
            CSV
          </a>
        </div>
        <div className="panel-b table-wrap">
          {topRecent.length === 0 ? (
            <p className="empty">Sem compras no período.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Última compra</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {topRecent.map((c) => (
                  <tr key={`r-${c.clientId}`}>
                    <td>
                      <Link href={`/painel/clientes/${c.clientId}`}>
                        {c.name}
                      </Link>
                      {c.city ? (
                        <div className="text-xs text-muted">{c.city}</div>
                      ) : null}
                    </td>
                    <td>
                      {c.lastOrderAt
                        ? c.lastOrderAt.toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{money(c.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Vendas do período</h2>
          <a
            className="btn btn-ghost"
            href={`/api/painel/reports/export?tipo=vendas&${exportQuery}`}
          >
            Exportar CSV
          </a>
        </div>
        <div className="panel-b table-wrap">
          {sales.length === 0 ? (
            <p className="empty">Nenhum pedido neste filtro.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th className="num">Livros</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderDate.toLocaleDateString("pt-BR")}</td>
                    <td>
                      <Link
                        href={`/painel/pedidos/${o.id}`}
                        className="text-accent-text underline"
                      >
                        {o.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{o.clientName}</td>
                    <td>{statusPill(o.status)}</td>
                    <td>{o.paymentMethod}</td>
                    <td className="num">{o.bookQty}</td>
                    <td className="num">{money(o.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Estoque (visão rápida)</h2>
          <a
            className="btn btn-ghost"
            href={`/api/painel/reports/export?tipo=estoque&${exportQuery}`}
          >
            Exportar CSV
          </a>
        </div>
        <div className="panel-b table-wrap">
          {lowStock.length === 0 ? (
            <p className="empty">
              Nenhum título zerado. Catálogo: {stock.length} títulos.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Indisponíveis / esgotados ({lowStock.length}
                {stock.filter((s) => s.available <= 0).length > lowStock.length
                  ? "+"
                  : ""}
                )
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Livro</th>
                    <th className="num">Estoque</th>
                    <th className="num">Reserv.</th>
                    <th className="num">Disp.</th>
                    <th>Local</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/painel/livros/${s.id}`}>{s.title}</Link>
                      </td>
                      <td className="num">{s.stock}</td>
                      <td className="num">{s.reserved}</td>
                      <td className="num">{s.available}</td>
                      <td>{s.location || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </>
  );
}
