import { NextResponse } from "next/server";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { resolveReportPeriod } from "@/lib/reports/period";
import {
  listSalesReport,
  listStockReport,
} from "@/lib/reports/queries";

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];
  return "\uFEFF" + lines.join("\n");
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!hasEntitlement(ctx.tenant.planCode, "reports_basic")) {
    return NextResponse.json({ error: "Plano sem relatórios." }, { status: 403 });
  }

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") || "vendas";
  const period = resolveReportPeriod({
    data_ini: url.searchParams.get("data_ini") || undefined,
    data_fim: url.searchParams.get("data_fim") || undefined,
    periodo: url.searchParams.get("periodo") || undefined,
  });
  const status = url.searchParams.get("status") || undefined;
  const pagamento = url.searchParams.get("pagamento") || undefined;

  let filename = "relatorio.csv";
  let csv = "";

  if (tipo === "estoque") {
    const rows = await listStockReport(ctx.tenant.id);
    filename = `estoque-${period.dataFim}.csv`;
    csv = toCsv(
      [
        "Título",
        "Autor",
        "Estoque",
        "Reservado",
        "Disponível",
        "Preço venda",
        "Localização",
      ],
      rows.map((r) => [
        r.title,
        r.author,
        r.stock,
        r.reserved,
        r.available,
        r.salePrice.toFixed(2),
        r.location,
      ]),
    );
  } else {
    const rows = await listSalesReport(
      ctx.tenant.id,
      period.dataIni,
      period.dataFim,
      { status, paymentMethod: pagamento },
    );
    filename = `vendas-${period.dataIni}_${period.dataFim}.csv`;
    csv = toCsv(
      [
        "Pedido",
        "Data",
        "Cliente",
        "Status",
        "Pagamento",
        "Itens",
        "Livros",
        "Valor",
      ],
      rows.map((r) => [
        r.id.slice(0, 8),
        r.orderDate.toISOString().slice(0, 10),
        r.clientName,
        r.status,
        r.paymentMethod,
        r.itemLines,
        r.bookQty,
        r.totalAmount.toFixed(2),
      ]),
    );
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
