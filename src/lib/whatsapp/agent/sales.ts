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
      const syn = h.synopsis
        ? h.synopsis.replace(/\s+/g, " ").slice(0, 90) + "…"
        : h.condition;
      return (
        `*${i + 1}. ${h.title}*` +
        (h.author ? ` — ${h.author}` : "") +
        `\n${money(h.salePrice)} · ${h.condition}\n_${syn}_`
      );
    })
    .join("\n\n");
}

function heuristicIntent(text: string): SalesIntent {
  const t = text.toLowerCase().trim();
  if (/atendente|humano|pessoa|falar com/.test(t)) {
    return { intent: "handoff", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/^(menu|ajuda|help|oi|olá|ola)\b/.test(t)) {
    return { intent: "menu", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/pedido|rastreio|status|andamento/.test(t)) {
    return { intent: "status_order", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/reserv|quero esse|quero o|compra|pegar o|fica comigo|fechado/.test(t)) {
    const m = t.match(/\b([1-3])\b/);
    return {
      intent: "reserve",
      query: "",
      bookIndex: m ? Number(m[1]) : 1,
      replyHint: "",
    };
  }
  if (/indica|recomenda|sugest|meu gosto|perfil/.test(t)) {
    return { intent: "recommend", query: "", bookIndex: 0, replyHint: "" };
  }
  if (/livros?|cat[aá]logo|tem |busca|procuro|quero/.test(t)) {
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
  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey) return heuristicIntent(text);

  try {
    const { content } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0.2,
      jsonSchema: INTENT_JSON_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            buildSalesSystemPrompt(seboName) +
            "\nClassifique a intenção da mensagem do cliente em JSON.",
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(content) as SalesIntent;
    if (!parsed?.intent) return heuristicIntent(text);
    return {
      intent: parsed.intent,
      query: parsed.query || "",
      bookIndex: Number(parsed.bookIndex) || 0,
      replyHint: parsed.replyHint || "",
    };
  } catch {
    return heuristicIntent(text);
  }
}

async function polishReply(
  seboName: string,
  draft: string,
  hint: string,
): Promise<string> {
  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey || draft.length < 20) return draft;
  try {
    const { content } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0.4,
      structured: false,
      messages: [
        {
          role: "system",
          content:
            buildSalesSystemPrompt(seboName) +
            "\nReescreva a mensagem abaixo para WhatsApp (markdown leve com *negrito*). " +
            "Mantenha TODOS os títulos, preços e números. Não invente livros. " +
            "Máximo ~1200 caracteres." +
            (hint ? `\nDica: ${hint}` : ""),
        },
        { role: "user", content: draft },
      ],
    });
    return content.trim() || draft;
  } catch {
    return draft;
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

  const intent = await classifyIntent(seboName, opts.text);
  const firstName = opts.clientName.split(" ")[0] || "tudo bem";

  if (intent.intent === "handoff") {
    await db
      .update(clientProfiles)
      .set({
        onboardingStep: "human",
        updatedAt: new Date(),
      })
      .where(eq(clientProfiles.id, opts.profileId));
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Claro, ${firstName}! Vou chamar alguém do sebo para te atender. Enquanto isso, pode deixar sua mensagem por aqui 🙏\n\n(Quando quiser o assistente de volta, digite: *voltar bot*)`,
    );
    return;
  }

  if (intent.intent === "menu") {
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Olá, ${firstName}! Posso te ajudar com:\n` +
        `• *Indicações* no seu gosto\n` +
        `• *Buscar* um título/autor\n` +
        `• *Reservar* um livro (fica aguardando pagamento)\n` +
        `• *Status* dos seus pedidos\n` +
        `• *Atendente* humano\n\nO que você procura?`,
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
        "Ainda não encontrei pedidos seus. Quer que eu indique um livro?",
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
      `Seus pedidos recentes:\n${lines.join("\n")}`,
    );
    return;
  }

  if (intent.intent === "reserve") {
    const suggested = await getSuggestedBooks(opts.tenantId, opts.phone);
    let bookId = suggested[(intent.bookIndex || 1) - 1] || suggested[0];
    if (!bookId && intent.query) {
      const found = await searchCatalogForAgent({
        tenantId: opts.tenantId,
        query: intent.query,
        limit: 1,
      });
      bookId = found[0]?.id;
    }
    if (!bookId) {
      await sendTextMessage(
        opts.cfg,
        opts.instanceName,
        opts.phone,
        "Não sei qual livro reservar. Peça uma indicação ou busque pelo título e depois diga *reservar 1*.",
      );
      return;
    }
    const [book] = await getBooksByIds(opts.tenantId, [bookId]);
    if (!book) {
      await sendTextMessage(
        opts.cfg,
        opts.instanceName,
        opts.phone,
        "Esse título acabou de ficar indisponível. Quer outra sugestão?",
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
        `Não consegui reservar: ${created.error}`,
      );
      return;
    }
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Reservei *${book.title}* pra você ✅\n` +
        `Pedido *#${shortId(created.id)}* · ${money(book.salePrice)}\n` +
        `Status: *Aguardando Pagamento* (Pix combinado com o sebo).\n` +
        `Qualquer dúvida, diga *atendente*.`,
    );
    return;
  }

  // browse / search / recommend / chitchat
  const interest = await getClientInterestTagNames(opts.clientId);
  const query =
    intent.intent === "recommend" || intent.intent === "browse"
      ? ""
      : intent.query || opts.text;

  const hits = await searchCatalogForAgent({
    tenantId: opts.tenantId,
    query: query || undefined,
    interestTags: interest,
    budgetMin: opts.budgetMin,
    budgetMax: opts.budgetMax,
    limit: 3,
  });

  await setSuggestedBooks(
    opts.tenantId,
    opts.phone,
    hits.map((h) => h.id),
  );

  let draft: string;
  if (!hits.length) {
    draft =
      intent.intent === "chitchat"
        ? `Oi, ${firstName}! Sou o assistente do ${seboName}. Posso indicar livros do acervo — diga um gênero, autor ou *indicações*.`
        : `Não achei título disponível com isso. Tenta outro termo ou peça *indicações*.`;
  } else {
    draft =
      (intent.intent === "recommend"
        ? `Separei algumas opções no seu gosto, ${firstName}:\n\n`
        : `Olha o que encontrei:\n\n`) +
      formatCatalog(hits) +
      `\n\nQuer reservar algum? Responda *reservar 1*, *reservar 2*…`;
  }

  const reply = await polishReply(seboName, draft, intent.replyHint);
  await sendTextMessage(opts.cfg, opts.instanceName, opts.phone, reply);
}
