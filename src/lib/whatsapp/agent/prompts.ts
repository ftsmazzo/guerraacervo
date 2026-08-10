export function buildSalesSystemPrompt(seboName: string) {
  return [
    `Você é o atendente do sebo "${seboName}" no WhatsApp — vende livros usados de verdade, não um menu de chatbot.`,
    "Tom: humano, curto, de quem conhece prateleira. Sem call center.",
    "Proibido: 'Que bom te ver', 'ficamos felizes', 'no seu gosto agora', emojis em excesso, jargão de assistente virtual.",
    "NUNCA invente livros fora da lista fornecida. Use títulos exatamente como vieram.",
    "No máximo 3 títulos. Uma frase de gancho por livro, sem colar sinopse inteira.",
    "Reserva = Aguardando Pagamento (Pix com o sebo).",
  ].join("\n");
}

export function buildSellerReplySystemPrompt(seboName: string) {
  return [
    buildSalesSystemPrompt(seboName),
    "Escreva UMA mensagem de WhatsApp (texto puro, use *negrito* do WhatsApp se fizer sentido).",
    "Se houver livros do autor/tema pedido: mostre o que tem, comente em 1 frase por título, e pergunte se tem algum título específico em mente ou se quer reservar (1, 2 ou 3).",
    "Se NÃO houver do autor/tema: diga com naturalidade; pergunte título em especial; se houver similares, ofereça na mesma linha — sem fingir que são do autor pedido.",
    "Se situacao=over_budget: os livros EXISTEM, mas passam da faixa de preço — diga isso com clareza, mostre preço e ofereça reservar mesmo assim ou buscar dentro da faixa.",
    "Se for só indicação por gosto: fale como quem puxa da prateleira, não 'lista de recomendações'.",
    "Feche com pergunta leve (título específico, número da lista, ou se quer outra linha).",
  ].join("\n");
}

export const INTENT_JSON_SCHEMA = {
  name: "wa_sales_intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: {
        type: "string",
        enum: [
          "browse",
          "search",
          "recommend",
          "reserve",
          "status_order",
          "handoff",
          "chitchat",
          "menu",
        ],
      },
      query: {
        type: "string",
        description:
          "Autor, título ou tema a buscar. Se a pessoa pediu indicação E citou autor/tema, preencha aqui (ex: CS Lewis).",
      },
      bookIndex: {
        type: "number",
        description:
          "Índice 1-based do livro sugerido para reservar, ou 0 se não souber",
      },
      replyHint: {
        type: "string",
        description: "Dica curta em PT para a resposta final",
      },
    },
    required: ["intent", "query", "bookIndex", "replyHint"],
  },
} as const;

export const SELLER_REPLY_JSON_SCHEMA = {
  name: "wa_seller_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      message: {
        type: "string",
        description: "Mensagem final de WhatsApp em português",
      },
    },
    required: ["message"],
  },
} as const;

export const THEME_EXPAND_JSON_SCHEMA = {
  name: "wa_theme_expand",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      themes: {
        type: "array",
        items: { type: "string" },
        description:
          "3 a 6 termos curtos em PT para buscar livros na mesma linha (gênero, tema, público)",
      },
    },
    required: ["themes"],
  },
} as const;

export type SalesIntent = {
  intent:
    | "browse"
    | "search"
    | "recommend"
    | "reserve"
    | "status_order"
    | "handoff"
    | "chitchat"
    | "menu";
  query: string;
  bookIndex: number;
  replyHint: string;
};
