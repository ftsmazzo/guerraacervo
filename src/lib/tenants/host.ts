/** Domínio raiz da plataforma (sem www). */
export function getRootDomain(): string {
  const explicit =
    process.env.ROOT_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();
  if (explicit) {
    return explicit.replace(/^www\./i, "").toLowerCase();
  }
  try {
    const host = new URL(
      process.env.NEXT_PUBLIC_APP_URL || "https://prismabook.com.br",
    ).hostname;
    return host.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "prismabook.com.br";
  }
}

const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "static",
  "assets",
  "painel",
  "login",
  "cadastro",
  "staging",
  "dev",
  "test",
  "status",
  "health",
  "evolution",
  "n8n",
  "docs",
]);

/**
 * Extrai o subdomínio do sebo a partir do Host.
 * Ex.: "sebo-cedoso.prismabook.com.br" → "sebo-cedoso"
 * Apex/www → null (landing da plataforma).
 */
export function extractTenantSubdomain(
  hostHeader: string | null | undefined,
  rootDomain = getRootDomain(),
): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0].trim().toLowerCase();
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return null;
  }
  // *.easypanel.host — não trata como tenant
  if (host.endsWith(".easypanel.host")) return null;

  const root = rootDomain.toLowerCase();
  if (host === root || host === `www.${root}`) return null;
  if (!host.endsWith(`.${root}`)) return null;

  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub.includes(".")) return null; // só 1 nível: slug.dominio
  if (RESERVED.has(sub)) return null;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) return null;
  return sub;
}

/** Candidatos de slug no banco a partir do subdomínio. */
export function slugCandidatesFromSubdomain(sub: string): string[] {
  const out = [sub];
  if (!sub.startsWith("sebo-")) out.push(`sebo-${sub}`.slice(0, 80));
  return out;
}

/**
 * URL pública da vitrine.
 * Preferimos path no apex (SSL estável). Subdomínio funciona quando o DNS
 * wildcard + certificado estiverem ok; o middleware já aceita os dois.
 */
export function publicStoreUrl(slug: string, rootDomain = getRootDomain()) {
  const preferSubdomain = process.env.PUBLIC_STORE_SUBDOMAIN === "1";
  if (preferSubdomain) {
    return `https://${slug}.${rootDomain}`;
  }
  return `https://${rootDomain}/v/${slug}`;
}
