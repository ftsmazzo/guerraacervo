export const ORDER_STATUSES = [
  "Aguardando Pagamento",
  "Pago",
  "Enviado",
  "Entregue",
  "Cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = [
  "Dinheiro",
  "Pix",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "Outro",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  "Aguardando Pagamento",
  "Pago",
  "Enviado",
];

export const DEBIT_STATUSES: OrderStatus[] = ["Pago", "Enviado", "Entregue"];
