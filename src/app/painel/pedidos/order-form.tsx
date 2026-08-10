"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  createOrder,
  searchOrderBooksAction,
} from "@/lib/orders/actions";
import type { BookPickerItem, ClientOption } from "@/lib/orders/queries";
import { PAYMENT_METHODS } from "@/lib/orders/constants";

type CartItem = {
  bookId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  weightGrams: number;
  unitPrice: number;
  quantity: number;
  available: number;
};

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPeso(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(2).replace(".", ",")} kg`;
  return `${g} g`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function OrderForm({
  clients,
  preselectedClientId,
}: {
  clients: ClientOption[];
  preselectedClientId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState(preselectedClientId || "");
  const [dataPedido, setDataPedido] = useState(todayISO());
  const [formaPagamento, setFormaPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [busca, setBusca] = useState("");
  const [results, setResults] = useState<BookPickerItem[]>([]);
  const [searching, setSearching] = useState(false);

  const totals = useMemo(() => {
    let peso = 0;
    let qtd = 0;
    let valor = 0;
    for (const i of cart) {
      peso += i.weightGrams * i.quantity;
      qtd += i.quantity;
      valor += i.unitPrice * i.quantity;
    }
    return { peso, qtd, valor };
  }, [cart]);

  async function onSearch() {
    setSearching(true);
    try {
      const rows = await searchOrderBooksAction(busca);
      setResults(rows);
    } finally {
      setSearching(false);
    }
  }

  function addBook(b: BookPickerItem) {
    setCart((prev) => {
      const existing = prev.find((x) => x.bookId === b.id);
      if (existing) {
        if (existing.quantity >= b.available) return prev;
        return prev.map((x) =>
          x.bookId === b.id ? { ...x, quantity: x.quantity + 1 } : x,
        );
      }
      return [
        ...prev,
        {
          bookId: b.id,
          title: b.title,
          author: b.author,
          coverUrl: b.coverUrl,
          weightGrams: b.weightGrams ?? 0,
          unitPrice: Number(b.salePrice),
          quantity: 1,
          available: b.available,
        },
      ];
    });
  }

  function setQty(bookId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((x) => {
          if (x.bookId !== bookId) return x;
          const q = Math.max(1, Math.min(x.available, quantity || 1));
          return { ...x, quantity: q };
        })
        .filter((x) => x.quantity > 0),
    );
  }

  function removeItem(bookId: string) {
    setCart((prev) => prev.filter((x) => x.bookId !== bookId));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clienteId) {
      setError("Selecione o cliente.");
      return;
    }
    if (!formaPagamento) {
      setError("Selecione a forma de pagamento.");
      return;
    }
    if (!cart.length) {
      setError("Adicione pelo menos um livro ao pedido.");
      return;
    }

    start(async () => {
      const result = await createOrder({
        clienteId,
        dataPedido,
        formaPagamento,
        observacoes: observacoes || null,
        itens: cart.map((c) => ({
          bookId: c.bookId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/painel/pedidos/${result.id}`);
      router.refresh();
    });
  }

  return (
    <div className="pedidos-page">
      <div className="page-header">
        <div>
          <h4>Novo Pedido</h4>
          <p className="breadcrumb">
            <Link href="/painel/pedidos">Pedidos</Link>
            {" / Novo"}
          </p>
        </div>
        <Link href="/painel/pedidos" className="btn-outline">
          Voltar
        </Link>
      </div>

      <div className="weight-bar">
        <div>
          <div className="wb-label">PESO TOTAL</div>
          <div className="wb-value accent">{formatPeso(totals.peso)}</div>
        </div>
        <div>
          <div className="wb-label">LIVROS</div>
          <div className="wb-value">{totals.qtd}</div>
        </div>
        <div>
          <div className="wb-label">VALOR TOTAL</div>
          <div className="wb-value accent">{money(totals.valor)}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="btn-accent"
            disabled={pending}
            onClick={() =>
              (
                document.getElementById("btn-submit-pedido") as HTMLButtonElement | null
              )?.click()
            }
          >
            Finalizar Pedido
          </button>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <form onSubmit={onSubmit}>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-header">
            <span className="card-title-icon">●</span> Dados do Pedido
          </div>
          <div className="card-body">
            <div className="row-g row-pedido">
              <div>
                <label className="form-label">
                  Cliente <span className="required-star">*</span>
                </label>
                <select
                  className="form-select"
                  required
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                >
                  <option value="">— Selecione o cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.city
                        ? ` — ${c.city}${c.state ? `/${c.state}` : ""}`
                        : ""}
                    </option>
                  ))}
                </select>
                <div className="form-text">
                  <Link href="/painel/clientes/novo" target="_blank">
                    Cadastrar novo cliente
                  </Link>
                </div>
              </div>
              <div>
                <label className="form-label">
                  Data do Pedido <span className="required-star">*</span>
                </label>
                <input
                  type="date"
                  className="form-control"
                  required
                  value={dataPedido}
                  onChange={(e) => setDataPedido(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">
                  Forma de Pagamento <span className="required-star">*</span>
                </label>
                <select
                  className="form-select"
                  required
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: "0.85rem" }}>
              <label className="form-label">Observações</label>
              <textarea
                className="form-control"
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Instruções de entrega, embalagem, etc."
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-header">
            <span className="card-title-icon">●</span> Adicionar Livros
          </div>
          <div className="card-body">
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                className="form-control"
                style={{ maxWidth: 360 }}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onSearch();
                  }
                }}
                placeholder="Buscar por título, autor ou ISBN…"
              />
              <button
                type="button"
                className="btn-accent"
                disabled={searching}
                onClick={() => void onSearch()}
              >
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {results.length > 0 ? (
              <div className="search-results">
                {results.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="search-item"
                    onClick={() => addBook(b)}
                  >
                    <span>
                      <strong>{b.title}</strong>
                      {b.author ? (
                        <span style={{ color: "var(--muted)" }}>
                          {" "}
                          — {b.author}
                        </span>
                      ) : null}
                      <br />
                      <small style={{ color: "var(--muted)" }}>
                        {money(Number(b.salePrice))} · disp. {b.available} ·{" "}
                        {b.condition}
                      </small>
                    </span>
                    <span className="btn-outline btn-sm">+ Adicionar</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title-icon">●</span> Itens do Pedido
          </div>
          <div className="card-body p-0">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}></th>
                    <th>Título</th>
                    <th style={{ textAlign: "end" }}>Peso</th>
                    <th style={{ textAlign: "center" }}>Qtd</th>
                    <th style={{ textAlign: "end" }}>Preço</th>
                    <th style={{ textAlign: "end" }}>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty">
                        Nenhum livro adicionado
                      </td>
                    </tr>
                  ) : (
                    cart.map((item) => (
                      <tr key={item.bookId}>
                        <td>
                          {item.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="cart-cover"
                            />
                          ) : (
                            <div className="cart-cover" />
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.title}</div>
                          {item.author ? (
                            <small style={{ color: "var(--muted)" }}>
                              {item.author}
                            </small>
                          ) : null}
                        </td>
                        <td style={{ textAlign: "end" }}>
                          {formatPeso(item.weightGrams * item.quantity)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="number"
                            min={1}
                            max={item.available}
                            className="form-control qty-input"
                            value={item.quantity}
                            onChange={(e) =>
                              setQty(item.bookId, Number(e.target.value))
                            }
                          />
                        </td>
                        <td style={{ textAlign: "end" }}>
                          {money(item.unitPrice)}
                        </td>
                        <td style={{ textAlign: "end", fontWeight: 600 }}>
                          {money(item.unitPrice * item.quantity)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => removeItem(item.bookId)}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            id="btn-submit-pedido"
            type="submit"
            className="btn-accent"
            disabled={pending}
          >
            {pending ? "Salvando…" : "Finalizar Pedido"}
          </button>
          <Link href="/painel/pedidos" className="btn-outline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
