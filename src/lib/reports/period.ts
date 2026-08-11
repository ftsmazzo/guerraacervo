export type ReportPeriodPreset =
  | "mes"
  | "mes_ant"
  | "7d"
  | "30d"
  | "ano"
  | "custom";

export type ReportPeriod = {
  dataIni: string; // YYYY-MM-DD
  dataFim: string;
  preset: ReportPeriodPreset;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function endOfDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function resolveReportPeriod(params: {
  data_ini?: string;
  data_fim?: string;
  periodo?: string;
}): ReportPeriod {
  const today = new Date();
  const preset = (params.periodo || "mes") as ReportPeriodPreset;

  if (params.data_ini && params.data_fim) {
    return {
      dataIni: params.data_ini,
      dataFim: params.data_fim,
      preset: params.periodo === "custom" || !params.periodo ? "custom" : preset,
    };
  }

  if (preset === "7d") {
    const ini = new Date(today);
    ini.setDate(ini.getDate() - 6);
    return { dataIni: toDateInput(ini), dataFim: toDateInput(today), preset };
  }
  if (preset === "30d") {
    const ini = new Date(today);
    ini.setDate(ini.getDate() - 29);
    return { dataIni: toDateInput(ini), dataFim: toDateInput(today), preset };
  }
  if (preset === "mes_ant") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { dataIni: toDateInput(first), dataFim: toDateInput(last), preset };
  }
  if (preset === "ano") {
    return {
      dataIni: `${today.getFullYear()}-01-01`,
      dataFim: toDateInput(today),
      preset,
    };
  }
  // mes atual
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    dataIni: toDateInput(first),
    dataFim: toDateInput(today),
    preset: "mes",
  };
}
