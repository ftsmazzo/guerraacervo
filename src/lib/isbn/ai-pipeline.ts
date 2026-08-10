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
  resolveOpenRouterConfig,
  type AiBookPartial,
} from "@/lib/isbn/openrouter";
import {
  applyBestEnrichment,
  fetchBestCatalogEnrichment,
  isEnrichmentSatisfied,
} from "@/lib/isbn/quality";
import { enrichBookTags } from "@/lib/isbn/tags-pt";
import {
  estimateWeightGrams,
  findCoverByTitleAuthor,
  resolveIsbnByMetadata,
  verifyIsbnExists,
} from "@/lib/isbn/verify";

export type AiResult = BookLookupResult & {
  isbn: string;
  confianca: number | null;
  isbnConfirmado: boolean;
  capaOrigem: "ia" | "catalogo" | "titulo" | "nenhuma";
  avisos: string[];
  colecao: string;
  pesoEstimado: boolean;
};

export const SYSTEM_BASE = `Você é um catalogador de sebo brasileiro experiente.
Regras CRÍTICAS:
- Identifique título, autor, editora e coleção/série (ex.: Reencontro Literatura).
- NUNCA invente ISBN. Só preencha se aparecer na capa OU for citado explicitamente na web para ESTA editora/coleção.
- Se houver várias edições (ex. 9788526283299 vs 9788526231332), escolha a que bater com a capa/coleção visível; senão isbn="".
- NUNCA invente URL de capa. capa="" se não tiver URL real de imagem.
- peso: só se a fonte informar em gramas/kg; senão null (o sistema estima).
- Prefira ISBN-13 brasileiro (97885…).
- Sinopse em português, completa (mín. 2–3 frases). Páginas se souber.
- Tags: 6 a 12 etiquetas CURTAS em português, úteis para filtrar no sebo. Cubra gênero literário, público (infantil / jovem adulto / adulto), temas, época/contexto e formato se fizer sentido (ex.: ficção, distopia, jovem adulto, clássico, brasileiro). Evite inglês e frases longas.
- Se a web trouxer pouca coisa, ainda assim preencha título/autor/editora com o que a capa mostra.`;

export function parseAiJson(
  content: string,
): AiBookPartial & Record<string, unknown> {
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

export function cleanIsbn(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const digits = raw.replace(/[^\dXx]/g, "");
  if (!isValidIsbnChecksum(digits)) return "";
  try {
    return normISBN(digits);
  } catch {
    return "";
  }
}

export function toResult(partial: AiBookPartial, src: string): AiResult {
  const base = emptyLookup(src);
  const tipo =
    partial.tipoCapa === "Brochura" || partial.tipoCapa === "Capa Dura"
      ? partial.tipoCapa
      : null;
  const capaRaw = String(partial.capa || "").trim();
  const colecao = String(partial.colecao || "").trim();
  const rawTags = Array.isArray(partial.tags)
    ? partial.tags.map(String).filter(Boolean)
    : [];
  if (colecao) rawTags.unshift(colecao);
  const tags = enrichBookTags([rawTags], {
    genero: String(partial.genero || ""),
    idioma: String(partial.idioma || ""),
    colecao,
    tipoCapa: tipo || "",
    ano: String(partial.ano || ""),
    titulo: String(partial.titulo || ""),
  });
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

export async function enrichIsbnAndWeight(
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

  await applyCatalog("inicial");

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
      await applyCatalog("pos-isbn");
    }
  }

  if ((!result.isbnConfirmado || !fichaOk()) && webSearch && cfg.apiKey) {
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
      await applyCatalog("reforco");
    }
  }

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
    result.avisos.push(
      "Ficha completa (sinopse + páginas) após busca progressiva.",
    );
  }
}

/** Enriquecimento em paralelo com limite de concorrência. */
export async function enrichResultsPool(
  results: AiResult[],
  cfg: ReturnType<typeof resolveOpenRouterConfig>,
  webSearch: boolean,
  concurrency = 3,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < results.length) {
      const idx = i++;
      await enrichIsbnAndWeight(results[idx], cfg, webSearch);
    }
  }
  const n = Math.min(concurrency, Math.max(1, results.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
}
