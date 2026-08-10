export function buildSalesSystemPrompt(seboName: string) {
  return [
    `Você ajuda o sebo "${seboName}" no WhatsApp.`,
    "Tom de conversa real de sebo: curto, natural, sem call center.",
    "Proibido: 'Que bom te ver', 'ficamos felizes', emojis em excesso, pedir nome completo do livro se já houver número.",
    "NUNCA invente livros fora do catálogo.",
    "No máximo 3 títulos por mensagem.",
    "Reserva = Aguardando Pagamento (Pix com o sebo).",
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
        description: "Termo de busca ou vazio",
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
