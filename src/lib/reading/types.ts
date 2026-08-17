export const READING_STATUSES = [
  "quero_ler",
  "lendo",
  "lido",
  "abandonado",
] as const;

export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  lendo: "Lendo",
  lido: "Lidos",
  quero_ler: "Quero ler",
  abandonado: "Abandonados",
};

export function isReadingStatus(v: string): v is ReadingStatus {
  return (READING_STATUSES as readonly string[]).includes(v);
}

export function todayInTimeZone(timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function hmInTimeZone(timeZone = "America/Sao_Paulo"): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export function parseRemindAt(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return { hour: 21, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(m[1]))),
    minute: Math.min(59, Math.max(0, Number(m[2]))),
  };
}
