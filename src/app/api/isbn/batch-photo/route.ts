import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SYSTEM_BASE,
  enrichResultsPool,
  parseAiJson,
  toResult,
  type AiResult,
} from "@/lib/isbn/ai-pipeline";
import { isPlausibleCoverUrl } from "@/lib/isbn/normalize";
import {
  MULTI_BOOK_JSON_SCHEMA,
  openRouterChat,
  OpenRouterError,
  resolveOpenRouterConfig,
  type AiBookPartial,
} from "@/lib/isbn/openrouter";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  imageBase64: z.string().min(20),
  webSearch: z.boolean().optional(),
});

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!hasEntitlement(ctx.tenant.planCode, "catalog")) {
    return NextResponse.json(
      { error: "Plano sem catálogo." },
      { status: 403 },
    );
  }

  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY não configurada." },
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
      { error: "Informe { imageBase64 }." },
      { status: 400 },
    );
  }

  const imageUrl = parsed.data.imageBase64.startsWith("data:")
    ? parsed.data.imageBase64
    : `data:image/jpeg;base64,${parsed.data.imageBase64}`;

  // Lote: enriquecimento de catálogo sem web LLM por item (mais rápido)
  const webSearch =
    parsed.data.webSearch !== undefined ? parsed.data.webSearch : false;

  try {
    const { content, modelUsed } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0,
      jsonSchema: MULTI_BOOK_JSON_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            SYSTEM_BASE +
            `\nTarefa: a foto mostra VÁRIOS livros numa mesa/pilha.
Liste cada livro visível (capa ou lombada), no máximo 8.
Não invente títulos. Se não der para ler um item, omita.
capa="" sempre. ISBN só se estiver legível na foto.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Liste os livros visíveis nesta foto. Um objeto por livro em livros[].",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    });

    const raw = parseAiJson(content) as {
      livros?: AiBookPartial[];
    };
    const list = Array.isArray(raw.livros) ? raw.livros : [];
    const books: AiResult[] = list
      .map((p) => toResult(p, `IA lote mesa (${modelUsed})`))
      .filter((b) => b.titulo.trim().length >= 2)
      .slice(0, 8);

    if (!books.length) {
      return NextResponse.json(
        {
          error:
            "Não identifiquei livros na foto. Tente de perto, com boa luz e capas/lombadas visíveis.",
          books: [],
          count: 0,
          model: modelUsed,
        },
        { status: 422 },
      );
    }

    await enrichResultsPool(books, cfg, webSearch, 3);

    for (const b of books) {
      if (
        b.capa &&
        isPlausibleCoverUrl(b.capa) &&
        !b.capa.includes("covers.openlibrary.org/b/isbn/")
      ) {
        // ok
      } else {
        b.capa = "";
        b.capaOrigem = "nenhuma";
      }
      if (!b.peso) {
        b.peso = 300;
        b.pesoEstimado = true;
        b.avisos.push("Peso padrão 300g — ajuste se souber.");
      }
      if (!b.idioma) b.idioma = "Português";
      if (!b.tipoCapa) b.tipoCapa = "Brochura";
    }

    return NextResponse.json({
      books,
      count: books.length,
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
        error: "Erro ao analisar a foto.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
