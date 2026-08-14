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
        description:
          "ISBN-13 confirmado (só dígitos) ou string vazia — NUNCA inventar",
      },
      sinopse: { type: "string" },
      capa: {
        type: "string",
        description:
          "URL https real de imagem de capa, ou vazio. Nunca URL terminando só com ISBN.",
      },
      genero: { type: "string" },
      colecao: {
        type: "string",
        description: "Coleção/série se houver (ex: Reencontro Literatura)",
      },
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
        description:
          "6 a 12 tags curtas em português para sebo: gênero, público (infantil/jovem adulto/adulto), temas, época, formato se couber (ex: ficção, distopia, jovem adulto, clássico)",
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
      "colecao",
      "idioma",
      "paginas",
      "tipoCapa",
      "peso",
      "tags",
      "confianca",
    ],
  },
} as const;

/** Vários livros numa única foto (mesa / pilha). */
export const MULTI_BOOK_JSON_SCHEMA = {
  name: "ficha_livros_mesa",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      livros: {
        type: "array",
        description: "Até 8 livros visíveis na foto (capa ou lombada)",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            titulo: { type: "string" },
            autor: { type: "string" },
            editora: { type: "string" },
            ano: { type: "string" },
            isbn: {
              type: "string",
              description:
                "ISBN só se legível na foto; senão string vazia — NUNCA inventar",
            },
            sinopse: { type: "string" },
            capa: {
              type: "string",
              description: "Sempre vazio — capa vem do catálogo depois",
            },
            genero: { type: "string" },
            colecao: { type: "string" },
            idioma: { type: "string" },
            paginas: { type: ["integer", "null"] },
            tipoCapa: { type: "string" },
            peso: { type: ["integer", "null"] },
            tags: { type: "array", items: { type: "string" } },
            confianca: {
              type: "number",
              description: "0 a 1 — certeza deste item",
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
            "colecao",
            "idioma",
            "paginas",
            "tipoCapa",
            "peso",
            "tags",
            "confianca",
          ],
        },
      },
    },
    required: ["livros"],
  },
} as const;

/** Passagem 2: só resolver ISBN/peso com busca web aberta */
export const ISBN_LOOKUP_SCHEMA = {
  name: "resolver_isbn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      isbn: {
        type: "string",
        description: "ISBN-13 confirmado na web ou vazio",
      },
      paginas: { type: ["integer", "null"] },
      peso: {
        type: ["integer", "null"],
        description: "Peso em gramas se a fonte informar",
      },
      capa: {
        type: "string",
        description: "URL real de imagem ou vazio",
      },
      editora: { type: "string" },
      ano: { type: "string" },
      confianca: { type: "number" },
      fonte: {
        type: "string",
        description: "Site/fonte onde o ISBN foi visto",
      },
    },
    required: [
      "isbn",
      "paginas",
      "peso",
      "capa",
      "editora",
      "ano",
      "confianca",
      "fonte",
    ],
  },
} as const;

export type AiBookPartial = Partial<BookLookupResult> & {
  isbn?: string;
  confianca?: number;
  colecao?: string;
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
    "https://prismabook.com.br";

  return { apiKey, model, fallbacks, webSearch, appUrl };
}

export function buildOpenRouterPlugins(
  webSearch: boolean,
  opts?: {
    unrestricted?: boolean;
    maxResults?: number;
    searchPrompt?: string;
  },
) {
  const plugins: Array<Record<string, unknown>> = [
    { id: "response-healing" },
  ];
  if (webSearch) {
    const web: Record<string, unknown> = {
      id: "web",
      max_results: opts?.maxResults ?? 5,
      search_prompt:
        opts?.searchPrompt ||
        "Resultados da web sobre o livro (título, autor, ISBN-13, editora, coleção, peso em gramas, páginas). Prefira edição brasileira. Só use ISBN se aparecer explicitamente na fonte.",
    };
    if (!opts?.unrestricted) {
      web.include_domains = [
        "openlibrary.org",
        "books.google.com",
        "worldcat.org",
        "amazon.com.br",
        "amazon.com",
        "estantevirtual.com.br",
        "skoob.com.br",
        "isbnsearch.org",
        "isbndb.com",
        "wikipedia.org",
        "scipione.com.br",
        "moderna.com.br",
        "atica.com.br",
        "companhiadasletras.com.br",
      ];
    }
    plugins.push(web);
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
  webOpts?: {
    unrestricted?: boolean;
    maxResults?: number;
    searchPrompt?: string;
  };
  /** Schema JSON custom (default BOOK_JSON_SCHEMA). */
  jsonSchema?: unknown;
  /** Se false, não força json_schema. Default true. */
  structured?: boolean;
}): Promise<{
  content: string;
  modelUsed: string;
  annotations?: unknown[];
}> {
  const structured = opts.structured !== false;
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0,
    messages: opts.messages,
    plugins: buildOpenRouterPlugins(opts.webSearch, opts.webOpts),
  };

  if (structured) {
    body.response_format = {
      type: "json_schema",
      json_schema: opts.jsonSchema || BOOK_JSON_SCHEMA,
    };
    body.provider = { require_parameters: true };
  }

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
      "X-OpenRouter-Title": "PrismaBook",
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
