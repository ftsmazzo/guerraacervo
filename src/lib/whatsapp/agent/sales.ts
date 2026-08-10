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
  SELLER_REPLY_JSON_SCHEMA,
  THEME_EXPAND_JSON_SCHEMA,
  buildSalesSystemPrompt,
  buildSellerReplySystemPrompt,
  type SalesIntent,
} from "@/lib/whatsapp/agent/prompts";
import { createOrderInternal } from "@/lib/whatsapp/agent/reserve";
import {
  authorMatchesQuery,
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

function hookLine(h: CatalogHit) {
  if (!h.synopsis) return "";
  const s = h.synopsis.replace(/\s+/g, " ").trim();
  if (s.length <= 90) return s;
  const cut = s.slice(0, 90);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut) + "…";
}

function formatSoftList(hits: CatalogHit[]) {
  return hits
    .map((h, i) => {
      const hook = hookLine(h);
      return (
        `*${i + 1}. ${h.title}*` +
        (h.author ? ` — ${h.author}` : "") +
        `\n${money(h.salePrice)} · ${h.condition}` +
        (hook ? `\n${hook}` : "")
      );
    })
    .join("\n\n");
}

/** Tira ruído de "aceito indicação / buscando algo do…" e deixa autor/tema. */
export function extractTopicQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\./g, " ")
    .replace(
      /\b(aceito|aceita|quero|gostaria|por\s+favor|pf|pfv|oi|ola|manda|me|um|uma|uns|umas|algo|algum|alguma|to|tou|estou|ta|buscando|procurando|procuro|busca|ver|tem|indicacao|indicacoes|recomenda|recomendacao|sugestao|sugere|no\s+meu\s+gosto|livros?|titulo|autor|escritor)\b/gi,
      " ",
    )
    .replace(/\b(d[oa]s?|de|do|da|dos|das)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (
    /^(oi|ol[aá]|ola|bom dia|boa tarde|boa noite)\b/.test(t) &&
    t.length < 40
  ) {
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
  if (idx && /livro|op[cç][aã]o|esse|essa|quero|pode ser|^o\s*[1-3]$/.test(t)) {
    return { intent: "reserve", query: "", bookIndex: idx, replyHint: "" };
  }

  const wantsRec = /\b(indica|recomenda|sugest|no meu gosto)\b/.test(t);
  const topic = extractTopicQuery(text);
  if (wantsRec) {
    // "Aceito indicação. CS Lewis" → search, não recommend genérico
    if (topic.length >= 3) {
      return { intent: "search", query: topic, bookIndex: 0, replyHint: "" };
    }
    return { intent: "recommend", query: "", bookIndex: 0, replyHint: "" };
  }

  return null;
}

function weakHeuristicIntent(text: string): SalesIntent {
  const topic = extractTopicQuery(text);
  if (topic.length >= 3) {
    return {
      intent: "search",
      query: topic,
      bookIndex: 0,
      replyHint: "",
    };
  }
  if (/livros?|cat[aá]logo|tem |busca|procuro|autor|t[ií]tulo/.test(text)) {
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
            "Se citar autor/tema (mesmo junto com indicação), intent=search e query=autor/tema. " +
            "Só use recommend quando pedir indicação SEM autor/tema. " +
            "Se citar um título específico para levar, intent=reserve e query=título.",
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(content) as SalesIntent;
    if (!parsed?.intent) return weakHeuristicIntent(text);
    let query = (parsed.query || "").trim();
    if (
      (parsed.intent === "recommend" || parsed.intent === "browse") &&
      !query
    ) {
      const topic = extractTopicQuery(text);
      if (topic.length >= 3) {
        return {
          intent: "search",
          query: topic,
          bookIndex: Number(parsed.bookIndex) || 0,
          replyHint: "",
        };
      }
    }
    if (parsed.intent === "search" && !query) {
      query = extractTopicQuery(text) || text.trim();
    }
    return {
      intent: parsed.intent,
      query,
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
      "Esse título acabou de sair da prateleira. Quer que eu te indique outro na mesma linha?",
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
    `Fechado — *${book.title}* fica reservado pra você.\n` +
      `Pedido *#${shortId(created.id)}* · ${money(book.salePrice)}\n` +
      `Status *Aguardando Pagamento* (Pix com o sebo).\n` +
      `Se preferir falar com alguém da loja, diga *atendente*.`,
  );
}

async function expandThemes(focus: string): Promise<string[]> {
  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey || focus.trim().length < 2) return [];
  try {
    const { content } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0.2,
      jsonSchema: THEME_EXPAND_JSON_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "Dado um autor ou tema literário, devolva termos curtos em português para buscar livros SEMELHANTES num sebo (gênero, temas centrais, público). Não invente títulos.",
        },
        {
          role: "user",
          content: `Autor/tema: ${focus}`,
        },
      ],
    });
    const parsed = JSON.parse(content) as { themes?: string[] };
    return (parsed.themes || [])
      .map((t) => String(t).trim())
      .filter((t) => t.length >= 3)
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function findSimilarHits(opts: {
  tenantId: string;
  focus: string;
  excludeIds: Set<string>;
  interestTags: string[];
  budgetMin: number | null;
  budgetMax: number | null;
}): Promise<CatalogHit[]> {
  const themes = await expandThemes(opts.focus);
  const queries = themes.length
    ? themes
    : [opts.focus, ...opts.interestTags.slice(0, 3)];
  const byId = new Map<string, CatalogHit>();
  for (const q of queries) {
    const found = await searchCatalogForAgent({
      tenantId: opts.tenantId,
      query: q,
      interestTags: opts.interestTags,
      budgetMin: opts.budgetMin,
      budgetMax: opts.budgetMax,
      limit: 8,
    });
    for (const h of found) {
      if (opts.excludeIds.has(h.id)) continue;
      // Não passar autor pedido como "similar"
      if (authorMatchesQuery(h.author, opts.focus)) continue;
      const prev = byId.get(h.id);
      if (!prev || h.score > prev.score) byId.set(h.id, h);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function fallbackSellerReply(opts: {
  firstName: string;
  focus: string;
  mode: "direct" | "similar" | "recommend" | "empty" | "chitchat";
  hits: CatalogHit[];
}): string {
  const hi = opts.firstName ? `${opts.firstName}, ` : "";
  const focus = opts.focus.trim();

  if (opts.mode === "chitchat") {
    return (
      `Oi${opts.firstName ? `, ${opts.firstName}` : ""}! ` +
      `Me fala um autor ou tema que eu olho na prateleira — ou diga *indicações* que eu puxo do seu gosto.`
    );
  }

  if (opts.mode === "direct" && opts.hits.length) {
    return (
      `${hi}do *${focus}* tenho isto agora:\n\n` +
      formatSoftList(opts.hits) +
      `\n\nTem algum título específico dele em mente? Se algum desses servir, é só mandar *1*, *2* ou *3*.`
    );
  }

  if (opts.mode === "similar" && opts.hits.length) {
    return (
      `${hi}do *${focus}* mesmo não tem na prateleira agora.\n` +
      `Você lembra de algum título em especial? (Nárnia, Cristianismo Puro e Simples… o que estiver buscando.)\n\n` +
      `Enquanto isso, na mesma linha temática achei:\n\n` +
      formatSoftList(opts.hits) +
      `\n\nQuer algum desses, ou prefere que eu fique de olho no autor?`
    );
  }

  if (opts.mode === "recommend" && opts.hits.length) {
    return (
      `${hi}puxei estes da prateleira pensando no seu gosto:\n\n` +
      formatSoftList(opts.hits) +
      `\n\nQuer reservar algum (*1*, *2*, *3*) ou prefere outro autor/tema?`
    );
  }

  if (focus) {
    return (
      `${hi}não achei *${focus}* disponível agora.\n` +
      `Tem algum título específico que você queria? Me manda o nome que eu vejo se consigo — ou outro autor/tema.`
    );
  }

  return `${hi}não achei com isso. Me fala um autor, um título ou um tema que eu busco de novo.`;
}

async function composeSellerReply(opts: {
  seboName: string;
  firstName: string;
  userText: string;
  focus: string;
  mode: "direct" | "similar" | "recommend" | "empty" | "chitchat";
  hits: CatalogHit[];
}): Promise<string> {
  const fallback = fallbackSellerReply(opts);
  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey || opts.mode === "chitchat") return fallback;
  if (!opts.hits.length && opts.mode !== "empty") return fallback;

  try {
    const catalog = opts.hits.map((h, i) => ({
      n: i + 1,
      title: h.title,
      author: h.author,
      price: money(h.salePrice),
      condition: h.condition,
      hook: hookLine(h),
      tags: h.tags.slice(0, 5),
    }));
    const { content } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0.55,
      jsonSchema: SELLER_REPLY_JSON_SCHEMA,
      messages: [
        {
          role: "system",
          content: buildSellerReplySystemPrompt(opts.seboName),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              cliente: opts.firstName || null,
              pedido_do_cliente: opts.userText,
              foco: opts.focus || null,
              situacao: opts.mode,
              // direct = temos do autor/tema; similar = não temos, oferecemos linha próxima
              livros_permitidos: catalog,
              regra:
                "Só cite livros de livros_permitidos. Numere 1..n. Não invente. Mensagem curta de WhatsApp.",
            },
            null,
            2,
          ),
        },
      ],
    });
    const parsed = JSON.parse(content) as { message?: string };
    const msg = (parsed.message || "").trim();
    if (msg.length < 20) return fallback;
    // Garante que títulos da lista aparecem (anti-alucinação grosseira)
    if (opts.hits.length) {
      const ok = opts.hits.some((h) =>
        msg.toLowerCase().includes(h.title.toLowerCase().slice(0, 18)),
      );
      if (!ok) return fallback;
    }
    return msg;
  } catch {
    return fallback;
  }
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
      `Oi${firstName ? `, ${firstName}` : ""}! Me fala um autor, um título ou um tema que eu olho na prateleira.\n` +
        `Se quiser, diga *indicações* que eu puxo do seu gosto — ou *atendente* pra falar com a loja.`,
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
        "Ainda não tem pedido seu por aqui. Quer que eu indique algo?",
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
        "Me diz qual: *1*, *2* ou *3* da lista — ou o título certinho.",
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
  const isRecommend =
    intent.intent === "recommend" || intent.intent === "browse";
  const focus =
    (intent.query || (!isRecommend ? extractTopicQuery(opts.text) : "")).trim();

  let mode: "direct" | "similar" | "recommend" | "empty" | "chitchat" =
    intent.intent === "chitchat" && !focus ? "chitchat" : "empty";
  let hits: CatalogHit[] = [];

  if (isRecommend && !focus) {
    hits = await searchCatalogForAgent({
      tenantId: opts.tenantId,
      interestTags: interest,
      budgetMin: opts.budgetMin,
      budgetMax: opts.budgetMax,
      limit: 6,
    });
    if (interest.length) {
      const matched = hits.filter((h) => h.score > 0);
      hits = matched.length ? matched.slice(0, 3) : [];
    } else {
      hits = hits.slice(0, 3);
    }
    mode = hits.length ? "recommend" : "empty";
  } else if (focus) {
    // 1) O que tem do autor/tema de verdade
    const authorHits = await searchCatalogForAgent({
      tenantId: opts.tenantId,
      query: focus,
      budgetMin: opts.budgetMin,
      budgetMax: opts.budgetMax,
      limit: 6,
      authorOnly: true,
    });
    if (authorHits.length) {
      hits = authorHits.slice(0, 3);
      mode = "direct";
    } else {
      // 2) Título/tema no catálogo (não só autor)
      const topicHits = await searchCatalogForAgent({
        tenantId: opts.tenantId,
        query: focus,
        interestTags: interest,
        budgetMin: opts.budgetMin,
        budgetMax: opts.budgetMax,
        limit: 6,
      });
      const strong = topicHits.filter((h) => h.score >= 5).slice(0, 3);
      if (strong.length) {
        hits = strong;
        mode = "direct";
      } else {
        // 3) Sem o pedido → similares na mesma linha + pergunta de título
        hits = await findSimilarHits({
          tenantId: opts.tenantId,
          focus,
          excludeIds: new Set(topicHits.map((h) => h.id)),
          interestTags: interest,
          budgetMin: opts.budgetMin,
          budgetMax: opts.budgetMax,
        });
        mode = hits.length ? "similar" : "empty";
      }
    }
  }

  await setSuggestedBooks(
    opts.tenantId,
    opts.phone,
    hits.map((h) => h.id),
  );

  const reply = await composeSellerReply({
    seboName,
    firstName,
    userText: opts.text,
    focus,
    mode,
    hits,
  });

  await sendTextMessage(opts.cfg, opts.instanceName, opts.phone, reply);
}
