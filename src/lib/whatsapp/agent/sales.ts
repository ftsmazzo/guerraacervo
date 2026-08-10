import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientProfiles, tenants } from "@/db/schema";
import {
  openRouterChat,
  resolveOpenRouterConfig,
} from "@/lib/isbn/openrouter";
import { listOrdersByClient } from "@/lib/orders/queries";
import {
  getSuggestedBooks,
  setSuggestedBooks,
} from "@/lib/whatsapp/agent/debounce";
import {
  INTENT_JSON_SCHEMA,
  buildSalesSystemPrompt,
  type SalesIntent,
} from "@/lib/whatsapp/agent/prompts";
import { createOrderInternal } from "@/lib/whatsapp/agent/reserve";
import {
  getBooksByIds,
  getClientInterestTagNames,
  searchCatalogForAgent,
  type CatalogHit,
} from "@/lib/whatsapp/agent/search";
import type { EvolutionConfig } from "@/lib/whatsapp/evolution";
import { sendTextMessage } from "@/lib/whatsapp/evolution";

function money(v: string | number) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatCatalog(hits: CatalogHit[]) {
  if (!hits.length) return "Nenhum título disponível no momento.";
  return hits
    .map((h, i) => {
      const line =
        h.synopsis
          ? h.synopsis.replace(/\s+/g, " ").slice(0, 80) + "…"
          : h.condition;
      return (
        `*${i + 1}. ${h.title}*` +
        (h.author ? ` — ${h.author}` : "") +
        `\n${money(h.salePrice)} · ${h.condition}` +
        (line ? `\n_${line}_` : "")
      );
    })
    .join("\n\n");
}

function ordinalIndex(text: string): number {
  const t = text.toLowerCase();
  if (/\b(primeiro|1[oº°]?|n[uú]mero\s*1|#\s*1)\b/.test(t)) return 1;
  if (/\b(segundo|2[oº°]?|n[uú]mero\s*2|#\s*2)\b/.test(t)) return 2;
  if (/\b(terceiro|3[oº°]?|n[uú]mero\s*3|#\s*3)\b/.test(t)) return 3;
  const m = t.match(
    /\b(?:livro|op[cç][aã]o|n[uú]mero|n[º°]?|#)?\s*([1-3])\b/,
  );
  if (m) return Number(m[1]);
  return 0;
}

/** Heurística de alta confiança — tem prioridade sobre o LLM. */
function strongHeuristicIntent(text: string): SalesIntent | null {
  const t = text.toLowerCase().trim();
  if (/atendente|humano|pessoa real|falar com (algu[eé]m|pessoa)/.test(t)) {
    return { intent: "handoff", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/^(menu|ajuda|help)$/i.test(t)) {
    return { intent: "menu", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/^(oi|ol[aá]|ola|bom dia|boa tarde|boa noite)\b/.test(t) && t.length < 40) {
    return { intent: "menu", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/\b(pedido|rastreio|status|andamento)\b/.test(t)) {
    return { intent: "status_order", query: "", bookIndex: 0, replyHint: "" };
  }

  const idx = ordinalIndex(t);
  const wantsReserve =
    /\b(reserv|quero|pega|ficar|fechado|compra|leva|esse|essa|este|esta)\b/.test(
      t,
    ) || /^(o|a)\s*[1-3]$/.test(t);

  if (wantsReserve && idx) {
    return { intent: "reserve", query: "", bookIndex: idx, replyHint: "" };
  }
  if (/^reserv(ar)?(\s+[1-3])?$/i.test(t)) {
    return {
      intent: "reserve",
      query: "",
      bookIndex: idx || 1,
      replyHint: "",
    };
  }
  // "quero o livro 2", "pode ser o 2", "o 2"
  if (idx && /livro|op[cç][aã]o|esse|essa|quero|pode ser|^o\s*[1-3]$/.test(t)) {
    return { intent: "reserve", query: "", bookIndex: idx, replyHint: "" };
  }

  if (/\b(indica|recomenda|sugest|no meu gosto)\b/.test(t)) {
    return { intent: "recommend", query: "", bookIndex: 0, replyHint: "" };
  }

  return null;
}

function weakHeuristicIntent(text: string): SalesIntent {
  const t = text.toLowerCase().trim();
  if (/livros?|cat[aá]logo|tem |busca|procuro|autor|t[ií]tulo/.test(t)) {
    return {
      intent: "search",
      query: text.trim(),
      bookIndex: 0,
      replyHint: "",
    };
  }
  return { intent: "chitchat", query: text, bookIndex: 0, replyHint: "" };
}

async function classifyIntent(
  seboName: string,
  text: string,
): Promise<SalesIntent> {
  const strong = strongHeuristicIntent(text);
  if (strong) return strong;

  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey) return weakHeuristicIntent(text);

  try {
    const { content } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0,
      jsonSchema: INTENT_JSON_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            buildSalesSystemPrompt(seboName) +
            "\nClassifique a intenção em JSON. " +
            '"quero o 2", "o livro 2", "reservar 1" = reserve com bookIndex. ' +
            "Se citar um título específico para levar, intent=reserve e query=título.",
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(content) as SalesIntent;
    if (!parsed?.intent) return weakHeuristicIntent(text);
    return {
      intent: parsed.intent,
      query: parsed.query || "",
      bookIndex: Number(parsed.bookIndex) || 0,
      replyHint: "",
    };
  } catch {
    return weakHeuristicIntent(text);
  }
}

function normalizeTitle(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveReserveBookId(opts: {
  tenantId: string;
  phone: string;
  bookIndex: number;
  query: string;
  rawText: string;
}): Promise<string | undefined> {
  const suggested = await getSuggestedBooks(opts.tenantId, opts.phone);
  if (opts.bookIndex > 0 && suggested[opts.bookIndex - 1]) {
    return suggested[opts.bookIndex - 1];
  }

  const needle = normalizeTitle(opts.query || opts.rawText);
  if (needle.length >= 4 && suggested.length) {
    const books = await getBooksByIds(opts.tenantId, suggested);
    const hit = books.find((b) => {
      const title = normalizeTitle(b.title);
      return title.includes(needle) || needle.includes(title.slice(0, 20));
    });
    if (hit) return hit.id;
  }

  if (opts.query.trim().length >= 4) {
    const found = await searchCatalogForAgent({
      tenantId: opts.tenantId,
      query: opts.query,
      limit: 1,
    });
    return found[0]?.id;
  }

  return suggested[0];
}

async function doReserve(opts: {
  cfg: EvolutionConfig;
  tenantId: string;
  instanceName: string;
  phone: string;
  clientId: string;
  bookId: string;
}) {
  const [book] = await getBooksByIds(opts.tenantId, [opts.bookId]);
  if (!book) {
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      "Esse título acabou de sair. Quer que eu indique outro?",
    );
    return;
  }
  const created = await createOrderInternal({
    tenantId: opts.tenantId,
    clientId: opts.clientId,
    bookId: book.id,
    notes: "Reserva via agente WhatsApp",
  });
  if (!created.ok) {
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Não rolou reservar: ${created.error}`,
    );
    return;
  }
  await sendTextMessage(
    opts.cfg,
    opts.instanceName,
    opts.phone,
    `Pronto — *${book.title}* reservado pra você.\n` +
      `Pedido *#${shortId(created.id)}* · ${money(book.salePrice)}\n` +
      `Fica *Aguardando Pagamento* (Pix com o sebo).\n` +
      `Se precisar de alguém, diga *atendente*.`,
  );
}

export async function runSalesAgent(opts: {
  cfg: EvolutionConfig;
  tenantId: string;
  instanceName: string;
  phone: string;
  clientId: string;
  clientName: string;
  profileId: string;
  budgetMin: number | null;
  budgetMax: number | null;
  text: string;
}) {
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId))
    .limit(1);
  const seboName = tenant?.name || "Sebo";
  const firstName = opts.clientName.split(" ")[0] || "";

  const intent = await classifyIntent(seboName, opts.text);

  if (intent.intent === "handoff") {
    await db
      .update(clientProfiles)
      .set({ onboardingStep: "human", updatedAt: new Date() })
      .where(eq(clientProfiles.id, opts.profileId));
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Combinado${firstName ? `, ${firstName}` : ""}. Vou avisar o pessoal do sebo — pode mandar o que precisar por aqui.\n` +
        `(Pra voltar comigo: *voltar bot*)`,
    );
    return;
  }

  if (intent.intent === "menu") {
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Oi${firstName ? `, ${firstName}` : ""}! Posso indicar algo no seu gosto, buscar um título ou reservar.\n` +
        `Manda *indicações*, um autor/tema, ou *atendente* se preferir falar com gente.`,
    );
    return;
  }

  if (intent.intent === "status_order") {
    const orders = await listOrdersByClient(opts.tenantId, opts.clientId);
    if (!orders.length) {
      await sendTextMessage(
        opts.cfg,
        opts.instanceName,
        opts.phone,
        "Ainda não tem pedido seu por aqui. Quer uma indicação?",
      );
      return;
    }
    const lines = orders.slice(0, 5).map((o) => {
      return (
        `• #${shortId(o.id)} · ${o.orderDate.toLocaleDateString("pt-BR")} · ` +
        `${money(o.totalAmount ?? 0)} · *${o.status}*`
      );
    });
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Seus pedidos:\n${lines.join("\n")}`,
    );
    return;
  }

  if (intent.intent === "reserve") {
    const bookId = await resolveReserveBookId({
      tenantId: opts.tenantId,
      phone: opts.phone,
      bookIndex: intent.bookIndex,
      query: intent.query,
      rawText: opts.text,
    });
    if (!bookId) {
      await sendTextMessage(
        opts.cfg,
        opts.instanceName,
        opts.phone,
        "Me diz qual: *1*, *2* ou *3* da lista — ou o título. Se ainda não viu opções, peça *indicações*.",
      );
      return;
    }
    await doReserve({
      cfg: opts.cfg,
      tenantId: opts.tenantId,
      instanceName: opts.instanceName,
      phone: opts.phone,
      clientId: opts.clientId,
      bookId,
    });
    return;
  }

  // Título citado que bate com sugestão recente → reserva direta
  const suggested = await getSuggestedBooks(opts.tenantId, opts.phone);
  if (suggested.length && opts.text.trim().length >= 6) {
    const books = await getBooksByIds(opts.tenantId, suggested);
    const needle = normalizeTitle(opts.text);
    const hit = books.find((b) => {
      const title = normalizeTitle(b.title);
      return (
        title === needle ||
        title.includes(needle) ||
        (needle.length >= 10 && needle.includes(title.slice(0, 18)))
      );
    });
    if (hit) {
      await doReserve({
        cfg: opts.cfg,
        tenantId: opts.tenantId,
        instanceName: opts.instanceName,
        phone: opts.phone,
        clientId: opts.clientId,
        bookId: hit.id,
      });
      return;
    }
  }

  const interest = await getClientInterestTagNames(opts.clientId);
  const query =
    intent.intent === "recommend" || intent.intent === "browse"
      ? ""
      : intent.query || opts.text;

  let hits = await searchCatalogForAgent({
    tenantId: opts.tenantId,
    query: query || undefined,
    interestTags: interest,
    budgetMin: opts.budgetMin,
    budgetMax: opts.budgetMax,
    limit: 6,
  });

  // Indicação: só títulos que realmente batem no gosto (score de tag)
  if (
    (intent.intent === "recommend" || intent.intent === "browse") &&
    interest.length
  ) {
    const matched = hits.filter((h) => h.score > 0);
    hits = matched.length ? matched.slice(0, 3) : [];
  } else {
    hits = hits.slice(0, 3);
  }

  await setSuggestedBooks(
    opts.tenantId,
    opts.phone,
    hits.map((h) => h.id),
  );

  let reply: string;
  if (!hits.length) {
    reply =
      intent.intent === "chitchat"
        ? `Oi${firstName ? `, ${firstName}` : ""}! Se quiser, peço *indicações* no seu perfil ou manda um autor/tema.`
        : interest.length &&
            (intent.intent === "recommend" || intent.intent === "browse")
          ? `No momento não achei disponível algo bem no seu gosto (${interest.slice(0, 3).join(", ")}). Quer tentar outro tema ou autor?`
          : `Não achei com isso. Tenta outro termo ou *indicações*.`;
  } else if (intent.intent === "recommend" || intent.intent === "browse") {
    reply =
      `${firstName ? `${firstName}, ` : ""}olha o que tem no seu gosto agora:\n\n` +
      formatCatalog(hits) +
      `\n\nQuer algum? Pode dizer *1*, *2* ou *3* (ou o título).`;
  } else {
    reply =
      `Achei isto:\n\n` +
      formatCatalog(hits) +
      `\n\nQuer reservar? Diz o número (*1*, *2*…) ou o título.`;
  }

  await sendTextMessage(opts.cfg, opts.instanceName, opts.phone, reply);
}
