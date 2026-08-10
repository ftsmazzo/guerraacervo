import { NextResponse } from "next/server";
import { z } from "zod";
import {
  emptyLookup,
  normISBN,
  type BookLookupResult,
} from "@/lib/isbn/normalize";
import {
  openRouterChat,
  OpenRouterError,
  resolveOpenRouterConfig,
  type AiBookPartial,
} from "@/lib/isbn/openrouter";

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
  if (digits.length < 10) return "";
  try {
    return normISBN(digits);
  } catch {
    return digits;
  }
}

function toResult(
  partial: AiBookPartial,
  src: string,
): BookLookupResult & { isbn: string; confianca: number | null } {
  const base = emptyLookup(src);
  const tipo =
    partial.tipoCapa === "Brochura" || partial.tipoCapa === "Capa Dura"
      ? partial.tipoCapa
      : null;
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
    capa: String(partial.capa || ""),
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
  };
}

const SYSTEM_BASE = `Você é um catalogador de sebo brasileiro. Preencha a ficha do livro com o máximo de precisão.
Regras:
- Prefira ISBN-13 (978/979). Se só houver ISBN-10, converta mentalmente ou informe o que encontrar.
- Tags curtas em português.
- Não invente ISBN. Se não tiver certeza, deixe isbn vazio e baixe confianca.
- tipoCapa só "Brochura" ou "Capa Dura" quando visível/conhecido.
- Use dados da web quando disponíveis para confirmar título, autor, editora e ISBN.`;

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
Tarefa: identificar o livro pela foto da capa (OCR do título/autor/selo + busca web se habilitada).`
    : `${SYSTEM_BASE}
Tarefa: preencher ficha a partir da descrição/busca textual do usuário (+ web se habilitada).`;

  const userContent = isImage
    ? [
        {
          type: "text" as const,
          text: "Identifique o livro nesta capa e preencha todos os campos do schema. Extraia ISBN se aparecer na imagem ou na web.",
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
    : `Descrição / busca do livro:\n${dataIn.query}\n\nPreencha a ficha completa. Se possível, resolva o ISBN-13.`;

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
      isImage ? `IA OpenRouter capa (${modelUsed})` : `IA OpenRouter (${modelUsed})`,
    );

    if (!result.titulo) {
      return NextResponse.json(
        { error: "Não foi possível identificar o livro.", ...result },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ...result,
      model: modelUsed,
      webSearch,
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
