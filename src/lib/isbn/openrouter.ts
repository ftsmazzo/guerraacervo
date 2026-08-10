import type { BookLookupResult } from "@/lib/isbn/normalize";

export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/** Padrão: visão + custo bom para capa/texto */
export const DEFAULT_MODEL = "google/gemini-2.5-flash";

/** Fallbacks: barato → precisão */
export const DEFAULT_FALLBACKS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
] as const;

export const BOOK_JSON_SCHEMA = {
  name: "ficha_livro",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      titulo: { type: "string", description: "Título do livro" },
      autor: { type: "string" },
      editora: { type: "string" },
      ano: { type: "string", description: "Ano AAAA ou vazio" },
      isbn: {
        type: "string",
        description: "ISBN-13 preferencial, só dígitos, ou vazio",
      },
      sinopse: { type: "string" },
      capa: { type: "string", description: "URL da capa se conhecida" },
      genero: { type: "string" },
      idioma: { type: "string", description: "Ex: Português" },
      paginas: { type: ["integer", "null"] },
      tipoCapa: {
        type: "string",
        description: 'Brochura, Capa Dura ou string vazia',
      },
      peso: {
        type: ["integer", "null"],
        description: "Peso em gramas",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags curtas em português",
      },
      confianca: {
        type: "number",
        description: "0 a 1 — certeza da identificação",
      },
    },
    required: [
      "titulo",
      "autor",
      "editora",
      "ano",
      "isbn",
      "sinopse",
      "capa",
      "genero",
      "idioma",
      "paginas",
      "tipoCapa",
      "peso",
      "tags",
      "confianca",
    ],
  },
} as const;

export type AiBookPartial = Partial<BookLookupResult> & {
  isbn?: string;
  confianca?: number;
};

export function resolveOpenRouterConfig() {
  const apiKey =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";

  const model =
    process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;

  const fallbacks = (
    process.env.OPENROUTER_MODEL_FALLBACKS ||
    DEFAULT_FALLBACKS.join(",")
  )
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== model);

  const webSearch =
    (process.env.OPENROUTER_WEB_SEARCH || "true").toLowerCase() !==
    "false";

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://guerraacervo-app.kxryyk.easypanel.host";

  return { apiKey, model, fallbacks, webSearch, appUrl };
}

export function buildOpenRouterPlugins(webSearch: boolean) {
  const plugins: Array<Record<string, unknown>> = [
    { id: "response-healing" },
  ];
  if (webSearch) {
    plugins.push({
      id: "web",
      max_results: 4,
      include_domains: [
        "openlibrary.org",
        "books.google.com",
        "worldcat.org",
        "amazon.com.br",
        "amazon.com",
        "estantevirtual.com.br",
        "skoob.com.br",
        "livraria.com.br",
        "submarino.com.br",
        "americanas.com.br",
        "isbnsearch.org",
        "isbndb.com",
      ],
      search_prompt:
        "Resultados da web sobre o livro (título, autor, ISBN, editora, edição). Use para preencher a ficha com dados verificáveis. Prefira ISBN-13 brasileiro quando houver.",
    });
  }
  return plugins;
}

export async function openRouterChat(opts: {
  apiKey: string;
  appUrl: string;
  model: string;
  fallbacks: string[];
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }>;
  webSearch: boolean;
  temperature?: number;
}): Promise<{
  content: string;
  modelUsed: string;
  annotations?: unknown[];
}> {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.15,
    messages: opts.messages,
    response_format: {
      type: "json_schema",
      json_schema: BOOK_JSON_SCHEMA,
    },
    plugins: buildOpenRouterPlugins(opts.webSearch),
    provider: {
      require_parameters: true,
    },
  };

  if (opts.fallbacks.length) {
    body.models = [opts.model, ...opts.fallbacks];
    body.route = "fallback";
  }

  const r = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": opts.appUrl,
      "X-OpenRouter-Title": "GuerraAcervo",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new OpenRouterError(
      r.status,
      errText.slice(0, 500) || `HTTP ${r.status}`,
    );
  }

  const data = (await r.json()) as {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | null;
        annotations?: unknown[];
      };
    }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new OpenRouterError(502, data.error.message);
  }

  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content || "",
    modelUsed: data.model || opts.model,
    annotations: msg?.annotations,
  };
}

export class OpenRouterError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}
