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
  isEnrichmentSatisfied,
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
  const fichaOk = () =>
    isEnrichmentSatisfied({
      sinopse: result.sinopse,
      paginas: result.paginas,
      idioma: result.idioma,
    });

  const applyCatalog = async (label: string) => {
    try {
      const enrich = await fetchBestCatalogEnrichment({
        titulo: result.titulo,
        autor: result.autor,
        editora: result.editora,
        isbn13: result.isbnConfirmado ? result.isbn : undefined,
      });
      const n = applyBestEnrichment(result, enrich);
      if (n > 0) {
        result.avisos.push(`Catálogo ${label}: +${n} campo(s).`);
      }
    } catch {
      result.avisos.push(`Catálogo ${label} indisponível.`);
    }
  };

  // —— Etapa A: validar ISBN da IA ——
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
        `ISBN ${result.isbn} inválido/ausente nos catálogos — ampliando busca…`,
      );
      result.isbn = "";
      result.isbnConfirmado = false;
    }
  }

  // —— Etapa B: catálogo progressivo (onda 1→3 até sinopse+páginas) ——
  await applyCatalog("inicial");

  // —— Etapa C: se ainda sem ISBN, resolve por metadados ——
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
      result.avisos.push(
        `ISBN resolvido via ${hit.fonte} (score ${hit.score.toFixed(0)}).`,
      );
      // Com ISBN novo, amplia de novo (costuma liberar páginas/sinopse)
      await applyCatalog("pos-isbn");
    }
  }

  // —— Etapa D: ainda incompleto → web aberta (ISBN) e nova passagem de catálogo ——
  if (
    (!result.isbnConfirmado || !fichaOk()) &&
    webSearch &&
    cfg.apiKey
  ) {
    if (!result.isbnConfirmado) {
      try {
        const { content } = await openRouterChat({
          apiKey: cfg.apiKey,
          appUrl: cfg.appUrl,
          model: cfg.model,
          fallbacks: cfg.fallbacks,
          webSearch: true,
          temperature: 0,
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
- Se houver várias edições da mesma editora, prefira a da coleção informada.
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

Consultas:
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
        const blob = content + " " + JSON.stringify(second);
        for (const m of blob.match(/\b97[89]\d{10}\b|\b\d{9}[\dXx]\b/gi) || []) {
          const c = cleanIsbn(m);
          if (c) candidates.add(c);
        }

        let chosen: string | null = null;
        let chosenMeta: Awaited<ReturnType<typeof verifyIsbnExists>> | null =
          null;
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
        if (
          !chosen &&
          primary &&
          isValidIsbnChecksum(primary.replace(/[^\dXx]/gi, ""))
        ) {
          chosen = primary;
          result.avisos.push(
            `ISBN ${primary} aceito pela busca web (fora do Google Books/OL). Confira na capa.`,
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
          await applyCatalog("pos-web");
        }
      } catch {
        result.avisos.push("Busca web de ISBN indisponível neste momento.");
      }
    } else if (!fichaOk()) {
      // Tem ISBN mas ficha pobre → mais uma passada de catálogo amplo
      await applyCatalog("reforco");
    }
  }

  // —— Etapa E: capa (sempre tenta HTTP boa; nunca placeholder OL) ——
  if (
    !result.capa ||
    !isPlausibleCoverUrl(result.capa) ||
    result.capa.includes("covers.openlibrary.org/b/isbn/")
  ) {
    result.capa =
      result.capa &&
      isPlausibleCoverUrl(result.capa) &&
      !result.capa.includes("covers.openlibrary.org/b/isbn/")
        ? result.capa
        : "";
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

  // Reforço: ISBN confirmado ainda sem capa → verifyIsbnExists
  if (
    result.isbnConfirmado &&
    result.isbn &&
    (!result.capa || result.capa.includes("covers.openlibrary.org/b/isbn/"))
  ) {
    try {
      const verified = await verifyIsbnExists(result.isbn);
      if (
        verified.ok &&
        verified.capa &&
        isPlausibleCoverUrl(verified.capa) &&
        !verified.capa.includes("covers.openlibrary.org/b/isbn/")
      ) {
        const { probeCoverUrl } = await import("@/lib/isbn/normalize");
        if (await probeCoverUrl(verified.capa)) {
          result.capa = verified.capa;
          result.capaOrigem = "catalogo";
        }
      }
    } catch {
      /* ignore */
    }
  }

  // —— Etapa F: peso ——
  if (!result.peso || result.pesoEstimado) {
    const est = estimateWeightGrams(result.paginas, result.tipoCapa);
    if (est && (!result.peso || result.pesoEstimado)) {
      result.peso = est;
      result.pesoEstimado = true;
      if (!result.avisos.some((a) => a.includes("Peso estimado"))) {
        result.avisos.push(`Peso estimado ~${est}g (páginas/tipo de capa).`);
      }
    }
  }

  if (!fichaOk()) {
    result.avisos.push(
      "Ficha ainda parcial após ampliar fontes — revise sinopse/páginas se preciso.",
    );
  } else {
    result.avisos.push("Ficha completa (sinopse + páginas) após busca progressiva.");
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

    // Fluxo com foto: preferir capa HTTP do catálogo; foto fica só como fallback no client
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
