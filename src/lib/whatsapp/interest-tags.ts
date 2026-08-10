/**
 * Tags genéricas demais para matching de indicação/aviso
 * (idioma, formato, estado — batem em quase o acervo inteiro).
 */
const GENERIC_INTEREST_TAGS = new Set(
  [
    "português",
    "portugues",
    "portuguese",
    "pt",
    "pt-br",
    "ptbr",
    "brasil",
    "brasileiro",
    "brasileira",
    "inglês",
    "ingles",
    "english",
    "espanhol",
    "spanish",
    "francês",
    "frances",
    "french",
    "idioma",
    "language",
    "língua",
    "lingua",
    "brochura",
    "capa dura",
    "capa-dura",
    "paperback",
    "hardcover",
    "ebook",
    "e-book",
    "novo",
    "usado",
    "ótimo",
    "otimo",
    "bom",
    "regular",
    "livro",
    "livros",
    "sebo",
    "acervo",
  ].map((t) => t.toLowerCase()),
);

function normalizeTag(tag: string) {
  return tag
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function isGenericInterestTag(tag: string): boolean {
  const raw = tag.trim().toLowerCase();
  if (!raw || raw.length < 2) return true;
  if (GENERIC_INTEREST_TAGS.has(raw)) return true;
  const folded = normalizeTag(raw);
  if (GENERIC_INTEREST_TAGS.has(folded)) return true;
  // "portugues (brasil)", "idioma: portugues"
  if (/^(idioma|language|lingua)\b/.test(folded)) return true;
  if (/\b(portugues|portuguese|ingles|english)\b/.test(folded) && folded.length < 24) {
    return true;
  }
  return false;
}

export function filterInterestTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const cleaned = t.trim().toLowerCase();
    if (!cleaned || isGenericInterestTag(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
