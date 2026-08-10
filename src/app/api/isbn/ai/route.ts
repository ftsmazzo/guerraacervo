import { NextResponse } from "next/server";
import { z } from "zod";
import {
  emptyLookup,
  isPlausibleCoverUrl,
  isValidIsbnChecksum,
  normISBN,
  type BookLookupResult,
} from "@/lib/isbn/normalize";
import {
  openRouterChat,
  OpenRouterError,
  resolveOpenRouterConfig,
  type AiBookPartial,
} from "@/lib/isbn/openrouter";
import { findCoverByTitleAuthor, verifyIsbnExists } from "@/lib/isbn/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const bodySchema = z.union([
  z.object({
    query: z.string().min(3),
    webSearch: z.boolean().optional(),
  }),
  z.object({
    imageBase64: z.string().min(20),
    webSearch: z.boolean().optional(),
  }),
]);

function parseAiJson(content: string): AiBookPartial {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as AiBookPartial;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as AiBookPartial;
      } catch {
        return {};
      }
    }
    return {};
  }
}

function cleanIsbn(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const digits = raw.replace(/[^\dXx]/g, "");
  if (!isValidIsbnChecksum(digits)) return "";
  try {
    return normISBN(digits);
  } catch {
    return "";
  }
}

function toResult(
  partial: AiBookPartial,
  src: string,
): BookLookupResult & {
  isbn: string;
  confianca: number | null;
  isbnConfirmado: boolean;
  capaOrigem: "ia" | "catalogo" | "titulo" | "nenhuma";
  avisos: string[];
} {
  const base = emptyLookup(src);
  const tipo =
    partial.tipoCapa === "Brochura" || partial.tipoCapa === "Capa Dura"
      ? partial.tipoCapa
      : null;
  const capaRaw = String(partial.capa || "").trim();
  return {
    ...base,
    titulo: String(partial.titulo || ""),
    paginas:
      typeof partial.paginas === "number" && partial.paginas > 0
        ? partial.paginas
        : null,
    autor: String(partial.autor || ""),
    editora: String(partial.editora || ""),
    ano: String(partial.ano || "").match(/\d{4}/)?.[0] || "",
    sinopse: String(partial.sinopse || ""),
    capa: isPlausibleCoverUrl(capaRaw) ? capaRaw : "",
    genero: String(partial.genero || ""),
    idioma: String(partial.idioma || ""),
    tipoCapa: tipo,
    peso:
      typeof partial.peso === "number" && partial.peso > 0
        ? partial.peso
        : null,
    tags: Array.isArray(partial.tags)
      ? partial.tags.map(String).filter(Boolean).slice(0, 12)
      : [],
    isbn: cleanIsbn(partial.isbn),
    confianca:
      typeof partial.confianca === "number" &&
      Number.isFinite(partial.confianca)
        ? Math.max(0, Math.min(1, partial.confianca))
        : null,
    isbnConfirmado: false,
    capaOrigem: isPlausibleCoverUrl(capaRaw) ? "ia" : "nenhuma",
    avisos: [],
  };
}

const SYSTEM_BASE = `Você é um catalogador de sebo brasileiro. Preencha a ficha do livro com precisão.
Regras CRÍTICAS:
- NUNCA invente ISBN. Só preencha isbn se ele aparecer na capa/foto OU for confirmado claramente nos resultados da web (mesmo título+autor+editora). Caso contrário isbn = "".
- NUNCA invente URL de capa. Campo "capa" só com URL real de imagem (jpg/png/webp) de CDN confiável. Se não tiver, capa = "".
- NÃO use URLs que terminem só com o número do ISBN (ex.: .../978...). Isso é inválido.
- Tags curtas em português.
- tipoCapa: "Brochura" ou "Capa Dura" só se visível/conhecido; senão "".
- Prefira ISBN-13 (978/979) quando confirmado.
- Se houver várias edições, escolha a edição brasileira mais comum e baixe confianca se houver dúvida.`;

export async function POST(request: Request) {
  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY não configurada (ou OPENAI_API_KEY legado).",
      },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe { query } ou { imageBase64 }." },
      { status: 400 },
    );
  }

  const dataIn = parsed.data;
  const isImage = "imageBase64" in dataIn;
  const webSearch =
    dataIn.webSearch !== undefined ? dataIn.webSearch : cfg.webSearch;

  const system = isImage
    ? `${SYSTEM_BASE}
Tarefa: identificar o livro pela foto da capa (OCR título/autor/selo + web).
Deixe capa="" — o sistema usará a foto enviada ou buscará capa real no catálogo.`
    : `${SYSTEM_BASE}
Tarefa: preencher ficha a partir da descrição/busca textual (+ web).`;

  const userContent = isImage
    ? [
        {
          type: "text" as const,
          text: "Identifique o livro nesta capa. Preencha título/autor/editora/sinopse. ISBN só se confirmado. capa deve ficar vazia.",
        },
        {
          type: "image_url" as const,
          image_url: {
            url: dataIn.imageBase64.startsWith("data:")
              ? dataIn.imageBase64
              : `data:image/jpeg;base64,${dataIn.imageBase64}`,
          },
        },
      ]
    : `Descrição / busca do livro:\n${dataIn.query}\n\nPreencha a ficha. ISBN só se confirmado na web. Não invente URL de capa.`;

  try {
    const { content, modelUsed } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });

    const partial = parseAiJson(content);
    const result = toResult(
      partial,
      isImage
        ? `IA OpenRouter capa (${modelUsed})`
        : `IA OpenRouter (${modelUsed})`,
    );

    if (!result.titulo) {
      return NextResponse.json(
        { error: "Não foi possível identificar o livro.", ...result },
        { status: 422 },
      );
    }

    if (result.isbn) {
      const verified = await verifyIsbnExists(result.isbn);
      if (verified.ok) {
        result.isbn = verified.isbn13;
        result.isbnConfirmado = true;
        if (!result.capa && verified.capa) {
          result.capa = verified.capa;
          result.capaOrigem = "catalogo";
        }
      } else {
        result.avisos.push(
          `ISBN ${result.isbn} não encontrado em Google Books/Open Library — descartado.`,
        );
        result.isbn = "";
        result.isbnConfirmado = false;
        if (typeof result.confianca === "number") {
          result.confianca = Math.min(result.confianca, 0.55);
        }
      }
    }

    if (!result.capa) {
      const found = await findCoverByTitleAuthor(result.titulo, result.autor);
      if (found) {
        result.capa = found;
        result.capaOrigem = "titulo";
      }
    }

    if (isImage && !result.capa) {
      result.capaOrigem = "nenhuma";
      result.avisos.push(
        "Capa de catálogo não encontrada — use a foto enviada no formulário.",
      );
    }

    return NextResponse.json({
      ...result,
      model: modelUsed,
      webSearch,
      useUploadedCover: isImage && result.capaOrigem === "nenhuma",
    });
  } catch (e) {
    if (e instanceof OpenRouterError) {
      return NextResponse.json(
        { error: "Falha na OpenRouter.", detail: e.detail },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    return NextResponse.json(
      {
        error: "Erro ao consultar OpenRouter.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
