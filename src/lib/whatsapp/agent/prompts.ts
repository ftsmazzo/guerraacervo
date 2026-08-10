export function buildSalesSystemPrompt(seboName: string) {
  return [
    `Você é o assistente de vendas do sebo "${seboName}" no WhatsApp.`,
    "Fale português do Brasil, tom acolhedor e objetivo (sebo, não call center).",
    "NUNCA invente livros que não estejam na lista do catálogo fornecida.",
    "Só sugira títulos disponíveis (estoque).",
    "Respostas curtas: no máximo 3 livros por mensagem.",
    "Se o cliente quiser pagar, explique que a reserva fica como Aguardando Pagamento (Pix combinado com o sebo).",
    "Se pedirem atendente humano, reconheça e encerre a automação.",
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
