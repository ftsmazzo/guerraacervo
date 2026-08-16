"use client";

import { useState, type FormEvent } from "react";
import { createWishItem, deleteWishItem } from "@/lib/wishlist/actions";

type Item = {
  id: string;
  isbn: string | null;
  title: string;
  author: string | null;
  notes: string | null;
};

export function WishlistClient({ items }: { items: Item[] }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await createWishItem({
      title,
      author: author || null,
      isbn: isbn || null,
      notes: notes || null,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setAuthor("");
    setIsbn("");
    setNotes("");
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-lg border border-line bg-card p-4 space-y-3"
      >
        <p className="text-sm font-medium text-ink">Adicionar livro que você procura</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Título</span>
            <input
              required
              className="w-full rounded-md border border-line bg-background px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Autor</span>
            <input
              className="w-full rounded-md border border-line bg-background px-3 py-2"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">ISBN (opcional)</span>
            <input
              className="w-full rounded-md border border-line bg-background px-3 py-2 font-mono"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Observação</span>
            <input
              className="w-full rounded-md border border-line bg-background px-3 py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Edição, faixa de preço…"
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Salvando…" : "Adicionar à lista"}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nenhum desejo ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium text-ink">{item.title}</p>
                <p className="text-sm text-muted">
                  {item.author || "Autor não informado"}
                  {item.isbn ? ` · ISBN ${item.isbn}` : ""}
                </p>
                {item.notes ? (
                  <p className="mt-1 text-xs text-muted">{item.notes}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="text-sm text-red-700 hover:underline"
                onClick={() => void deleteWishItem(item.id)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
