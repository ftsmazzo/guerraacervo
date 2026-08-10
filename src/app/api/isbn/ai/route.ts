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
  ISBN_LOOKUP_SCHEMA,
  openRouterChat,
  OpenRouterError,
  resolveOpenRouterConfig,
  type AiBookPartial,
} from "@/lib/isbn/openrouter";
import {
  estimateWeightGrams,
  findCoverByTitleAuthor,
  resolveIsbnByMetadata,
  verifyIsbnExists,
} from "@/lib/isbn/verify";
import {
  applyBestEnrichment,
  fetchBestCatalogEnrichment,
  isPoorSynopsis,
} from "@/lib/isbn/quality";

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

function parseAiJson(content: string): AiBookPartial & Record<string, unknown> {
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

type AiResult = BookLookupResult & {
  isbn: string;
  confianca: number | null;
  isbnConfirmado: boolean;
  capaOrigem: "ia" | "catalogo" | "titulo" | "nenhuma";
  avisos: string[];
  colecao: string;
  pesoEstimado: boolean;
};

function toResult(partial: AiBookPartial, src: string): AiResult {
  const base = emptyLookup(src);
  const tipo =
    partial.tipoCapa === "Brochura" || partial.tipoCapa === "Capa Dura"
      ? partial.tipoCapa
      : null;
  const capaRaw = String(partial.capa || "").trim();
  const colecao = String(partial.colecao || "").trim();
  const tags = Array.isArray(partial.tags)
    ? partial.tags.map(String).filter(Boolean).slice(0, 12)
    : [];
  if (colecao && !tags.some((t) => t.toLowerCase() === colecao.toLowerCase())) {
    tags.unshift(colecao);
  }
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
    tags,
    isbn: cleanIsbn(partial.isbn),
    confianca:
      typeof partial.confianca === "number" &&
      Number.isFinite(partial.confianca)
        ? Math.max(0, Math.min(1, partial.confianca))
        : null,
    isbnConfirmado: false,
    capaOrigem: isPlausibleCoverUrl(capaRaw) ? "ia" : "nenhuma",
    avisos: [],
    colecao,
    pesoEstimado: false,
  };
}

const SYSTEM_BASE = `Você é um catalogador de sebo brasileiro experiente.
Regras CRÍTICAS:
- Identifique título, autor, editora e coleção/série (ex.: Reencontro Literatura).
- NUNCA invente ISBN. Só preencha se aparecer na capa OU for citado explicitamente na web para ESTA editora/coleção.
- Se houver várias edições (ex. 9788526283299 vs 9788526231332), escolha a que bater com a capa/coleção visível; senão isbn="".
- NUNCA invente URL de capa. capa="" se não tiver URL real de imagem.
- peso: só se a fonte informar em gramas/kg; senão null (o sistema estima).
- Prefira ISBN-13 brasileiro (97885…).
- Sinopse em português, completa (mín. 2–3 frases). Páginas se souber.
- Se a web trouxer pouca coisa, ainda assim preencha título/autor/editora com o que a capa mostra.`;

async function enrichIsbnAndWeight(
  result: AiResult,
  cfg: ReturnType<typeof resolveOpenRouterConfig>,
  webSearch: boolean,
): Promise<void> {
  // 1) Se IA trouxe ISBN, validar em catálogo
  if (result.isbn) {
    const verified = await verifyIsbnExists(result.isbn);
    if (verified.ok) {
      result.isbn = verified.isbn13;
      result.isbnConfirmado = true;
      if (!result.capa && verified.capa) {
        result.capa = verified.capa;
        result.capaOrigem = "catalogo";
      }
      if (!result.paginas && verified.paginas) result.paginas = verified.paginas;
      if (!result.peso && verified.peso) result.peso = verified.peso;
      if (!result.editora && verified.editora) result.editora = verified.editora;
    } else {
      result.avisos.push(
        `ISBN ${result.isbn} inválido/ausente nos catálogos — buscando pela ficha…`,
      );
      result.isbn = "";
      result.isbnConfirmado = false;
    }
  }

  // 2) Resolver ISBN por título+editora+autor (estilo busca Google)
  if (!result.isbnConfirmado) {
    const hit = await resolveIsbnByMetadata({
      titulo: result.titulo,
      autor: result.autor,
      editora: result.editora,
      colecao: result.colecao,
    });
    if (hit) {
      result.isbn = hit.isbn13;
      result.isbnConfirmado = true;
      if (!result.capa && hit.capa) {
        result.capa = hit.capa;
        result.capaOrigem = "catalogo";
      }
      if (!result.paginas && hit.paginas) result.paginas = hit.paginas;
      if (!result.peso && hit.peso) result.peso = hit.peso;
      if (!result.editora && hit.editora) result.editora = hit.editora;
      if (!result.ano && hit.ano) result.ano = hit.ano;
      result.avisos.push(`ISBN resolvido via ${hit.fonte} (score ${hit.score.toFixed(0)}).`);
    }
  }

  // 3) Segunda passagem IA: busca web ABERTA só para ISBN (como você fez no Google)
  if (!result.isbnConfirmado && webSearch && cfg.apiKey) {
    try {
      const { content } = await openRouterChat({
        apiKey: cfg.apiKey,
        appUrl: cfg.appUrl,
        model: cfg.model,
        fallbacks: cfg.fallbacks,
        webSearch: true,
        temperature: 0.05,
        jsonSchema: ISBN_LOOKUP_SCHEMA,
        webOpts: {
          unrestricted: true,
          maxResults: 8,
          searchPrompt:
            "Encontre páginas que cite ISBN da edição brasileira (título + editora + coleção). Liste ISBN-13/ISBN-10 explícitos. Inclua peso em gramas se houver.",
        },
        messages: [
          {
            role: "system",
            content: `Você pesquisa ISBN como um sebo brasileiro.
- Só devolva ISBN que apareça escrito na fonte.
- Se houver várias edições da mesma editora, prefira a da coleção informada; edições escolares/adaptação antigas costumam ter ISBN-10 8526… 
- Não invente. Se incerto, isbn="".`,
          },
          {
            role: "user",
            content: `Qual o ISBN desta edição?
Título: ${result.titulo}
Autor: ${result.autor || "—"}
Editora: ${result.editora || "—"}
Coleção: ${result.colecao || "—"}
Ano: ${result.ano || "—"}

Consultas sugeridas:
1) ISBN ${result.titulo} ${result.editora}
2) ISBN ${result.titulo} ${result.colecao} ${result.editora}
3) ${result.titulo} ${result.editora} 97885`,
          },
        ],
      });
      const second = parseAiJson(content);
      const candidates = new Set<string>();
      const primary = cleanIsbn(second.isbn);
      if (primary) candidates.add(primary);
      // Extrai outros ISBNs mencionados no JSON/texto (ex.: edição antiga vs nova)
      const blob = content + " " + JSON.stringify(second);
      for (const m of blob.match(/\b97[89]\d{10}\b|\b\d{9}[\dXx]\b/gi) || []) {
        const c = cleanIsbn(m);
        if (c) candidates.add(c);
      }

      let chosen: string | null = null;
      let chosenMeta: Awaited<ReturnType<typeof verifyIsbnExists>> | null =
        null;
      // Prefere 97885 (BR) e depois qualquer confirmado
      const ordered = [...candidates].sort((a, b) => {
        const br = (x: string) => (x.startsWith("97885") ? 0 : 1);
        return br(a) - br(b);
      });
      for (const cand of ordered) {
        const verified = await verifyIsbnExists(cand);
        if (verified.ok) {
          chosen = verified.isbn13;
          chosenMeta = verified;
          break;
        }
      }

      // Catálogos internacionais muitas vezes NÃO têm ISBN escolar Scipione.
      // Se o checksum é válido e a IA apontou fonte, aceita com aviso.
      if (!chosen && primary && isValidIsbnChecksum(primary.replace(/[^\dXx]/gi, ""))) {
        chosen = primary;
        result.avisos.push(
          `ISBN ${primary} aceito pela busca web (não indexado no Google Books/OL). Confira na capa/código de barras.`,
        );
      }

      if (chosen) {
        result.isbn = chosen;
        result.isbnConfirmado = true;
        if (
          !result.capa &&
          (isPlausibleCoverUrl(String(second.capa || "")) ||
            chosenMeta?.capa)
        ) {
          result.capa =
            (isPlausibleCoverUrl(String(second.capa || ""))
              ? String(second.capa)
              : "") ||
            chosenMeta?.capa ||
            "";
          if (result.capa) result.capaOrigem = "catalogo";
        }
        if (!result.paginas) {
          result.paginas =
            (typeof second.paginas === "number" ? second.paginas : null) ||
            chosenMeta?.paginas ||
            null;
        }
        if (!result.peso) {
          result.peso =
            (typeof second.peso === "number" && second.peso > 0
              ? second.peso
              : null) ||
            chosenMeta?.peso ||
            null;
        }
        result.avisos.push(
          `ISBN via web (${String(second.fonte || "busca aberta")}).`,
        );
      }
    } catch {
      result.avisos.push("Busca web de ISBN indisponível neste momento.");
    }
  }

  // 4) Capa por título se ainda faltar (nunca placeholder OL /b/isbn/)
  if (
    !result.capa ||
    result.capa.includes("covers.openlibrary.org/b/isbn/")
  ) {
    result.capa = result.capa.includes("covers.openlibrary.org/b/isbn/")
      ? ""
      : result.capa;
    const found = await findCoverByTitleAuthor(
      result.titulo,
      result.autor,
      result.editora,
    );
    if (found && !found.includes("covers.openlibrary.org/b/isbn/")) {
      const { probeCoverUrl } = await import("@/lib/isbn/normalize");
      if (await probeCoverUrl(found)) {
        result.capa = found;
        result.capaOrigem = "titulo";
      }
    }
  }

  // 5) Peso: catálogo > estimativa por páginas (obrigatório no sebo)
  if (!result.peso) {
    const est = estimateWeightGrams(result.paginas, result.tipoCapa);
    if (est) {
      result.peso = est;
      result.pesoEstimado = true;
      result.avisos.push(`Peso estimado ~${est}g (páginas/tipo de capa).`);
    }
  }

  // 6) Sempre cruzar catálogos e ficar com o MELHOR de cada campo
  // (mata a instabilidade: IA identifica; fontes ricas completam)
  try {
    const enrich = await fetchBestCatalogEnrichment({
      titulo: result.titulo,
      autor: result.autor,
      editora: result.editora,
      isbn13: result.isbnConfirmado ? result.isbn : undefined,
    });
    const n = applyBestEnrichment(result, enrich);
    if (
      n === 0 &&
      (isPoorSynopsis(result.sinopse) || !result.paginas)
    ) {
      result.avisos.push(
        "Catálogos sem sinopse/páginas fortes para esta edição — confira manualmente.",
      );
    }
    // Recalcula peso se páginas chegaram agora
    if ((!result.peso || result.pesoEstimado) && result.paginas) {
      const est = estimateWeightGrams(result.paginas, result.tipoCapa);
      if (est && (!result.peso || result.pesoEstimado)) {
        result.peso = est;
        result.pesoEstimado = true;
      }
    }
  } catch {
    result.avisos.push("Enriquecimento de catálogo indisponível nesta tentativa.");
  }
}

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

    // Fluxo com foto: capa upload tem prioridade — não devolver placeholder
    if (isImage) {
      if (
        !result.capa ||
        result.capa.includes("covers.openlibrary.org/b/isbn/")
      ) {
        result.capa = "";
        result.capaOrigem = "nenhuma";
        result.avisos.push(
          "Mantendo a foto enviada como capa (catálogo sem imagem confiável).",
        );
      }
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
