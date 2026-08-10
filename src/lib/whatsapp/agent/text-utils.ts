/** Tira ruído de "aceito indicação / buscando algo do…" e deixa autor/tema. */
export function extractTopicQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\./g, " ")
    .replace(
      /\b(aceito|aceita|quero|queria|gostaria|por\s+favor|pf|pfv|oi|ola|manda|me|um|uma|uns|umas|algo|algum|alguma|to|tou|estou|ta|buscando|procurando|procuro|busca|ver|tem|indicacao|indicacoes|recomenda|recomendacao|sugestao|sugere|no\s+meu\s+gosto|livros?|titulo|autor|escritor)\b/gi,
      " ",
    )
    .replace(/\b(d[oa]s?|de|do|da|dos|das)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesLooselyMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(" ").filter((w) => w.length > 2);
  const tb = nb.split(" ").filter((w) => w.length > 2);
  if (ta.length >= 2 && tb.length >= 2) {
    const hit = ta.filter((w) => tb.includes(w)).length;
    return hit >= Math.min(3, Math.min(ta.length, tb.length));
  }
  return false;
}
