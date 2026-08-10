import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SYSTEM_BASE,
  enrichIsbnAndWeight,
  parseAiJson,
  toResult,
} from "@/lib/isbn/ai-pipeline";
import { isPlausibleCoverUrl } from "@/lib/isbn/normalize";
import {
  openRouterChat,
  OpenRouterError,
  resolveOpenRouterConfig,
} from "@/lib/isbn/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
Tarefa: identificar o livro pela foto (OCR + web). capa="" — o sistema completa capa/ISBN depois.`
    : `${SYSTEM_BASE}
Tarefa: preencher ficha a partir da descrição (+ web).`;

  const userContent = isImage
    ? [
        {
          type: "text" as const,
          text: "Identifique título, autor, editora, coleção e sinopse. ISBN só se legível/confirmado. capa vazia.",
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
    : `Descrição / busca:\n${dataIn.query}\n\nPreencha a ficha. Informe coleção se houver. ISBN só confirmado.`;

  try {
    const { content, modelUsed } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch,
      temperature: 0,
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

    await enrichIsbnAndWeight(result, cfg, webSearch);

    if (isImage) {
      if (
        result.capa &&
        isPlausibleCoverUrl(result.capa) &&
        !result.capa.includes("covers.openlibrary.org/b/isbn/")
      ) {
        result.avisos.push("Capa da web encontrada — preferir em vez da foto.");
      } else {
        result.capa = "";
        result.capaOrigem = "nenhuma";
        result.avisos.push(
          "Sem capa confiável na web — o formulário usará a foto recortada.",
        );
      }
    }

    return NextResponse.json({
      ...result,
      model: modelUsed,
      webSearch,
      useUploadedCover: isImage && !result.capa,
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
