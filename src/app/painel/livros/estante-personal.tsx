import Link from "next/link";
import { DeleteBookButton } from "./delete-book-button";
import { ReadingBookCard } from "@/components/reading/reading-cover";
import {
  READING_STATUS_LABEL,
  READING_STATUSES,
  type ReadingStatus,
} from "@/lib/reading/types";
import type { BookListItem } from "@/lib/books/queries";

const TAG_COLORS = [
  "#e67e22",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#d97706",
  "#be185d",
  "#0d9488",
  "#9333ea",
];

function tagColor(tag: string) {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % TAG_COLORS.length;
  return TAG_COLORS[h];
}

function buildHref(
  base: Record<string, string>,
  overrides: Record<string, string | undefined>,
) {
  const p = new URLSearchParams();
  const merged = { ...base, ...overrides };
  Object.entries(merged).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `/painel/livros?${s}` : "/painel/livros";
}

export function PersonalEstante({
  livros,
  cloud,
  counts,
  shelf,
  busca,
  activeTags,
  loadError,
}: {
  livros: BookListItem[];
  cloud: { name: string; qtd: number }[];
  counts: Record<ReadingStatus, number>;
  shelf: ReadingStatus;
  busca: string;
  activeTags: string[];
  loadError: string | null;
}) {
  const base: Record<string, string> = {};
  if (busca) base.busca = busca;
  if (activeTags.length) base.tags = activeTags.join(",");
  if (shelf !== "lendo") base.shelf = shelf;

  function toggleTag(name: string) {
    const next = activeTags.includes(name)
      ? activeTags.filter((t) => t !== name)
      : [...activeTags, name];
    return buildHref(base, {
      tags: next.length ? next.join(",") : undefined,
    });
  }

  return (
    <div className="livros-page">
      {loadError ? (
        <div
          className="card"
          style={{
            marginBottom: "0.75rem",
            borderColor: "#dc2626",
            color: "#991b1b",
          }}
        >
          <div className="card-body">Falha ao carregar livros: {loadError}</div>
        </div>
      ) : null}

      <div className="page-header">
        <div>
          <h4>
            <span style={{ color: "var(--accent)", marginRight: 8 }}>📚</span>
            Estante
          </h4>
          <small className="text-muted">
            {counts[shelf]} nesta prateleira
            {activeTags.length
              ? ` · filtrando por ${activeTags.length} tag(s)`
              : ""}
          </small>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/painel/livros/lote"
            className="btn-accent"
            style={{
              background: "transparent",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
            }}
          >
            Foto da mesa
          </Link>
          <Link href="/painel/livros/novo" className="btn-accent">
            + Novo livro
          </Link>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {READING_STATUSES.map((s) => {
          const active = s === shelf;
          return (
            <Link
              key={s}
              href={buildHref(base, { shelf: s === "lendo" ? undefined : s })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-card text-ink"
              }`}
            >
              {READING_STATUS_LABEL[s]} · {counts[s]}
            </Link>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: "0.75rem" }}>
        <div className="card-body" style={{ padding: "0.6rem 1rem" }}>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            {activeTags.length ? (
              <input type="hidden" name="tags" value={activeTags.join(",")} />
            ) : null}
            {shelf !== "lendo" ? (
              <input type="hidden" name="shelf" value={shelf} />
            ) : null}
            <div style={{ flex: "1 1 220px" }}>
              <input
                name="busca"
                defaultValue={busca}
                className="form-control"
                placeholder="Título, autor, ISBN, editora…"
              />
            </div>
            <button className="btn-accent" type="submit">
              Buscar
            </button>
            <Link
              href="/painel/livros"
              className="rounded-md border border-line px-3 py-2 text-sm"
            >
              Limpar
            </Link>
          </form>
        </div>
      </div>

      {cloud.length ? (
        <div className="card" style={{ marginBottom: "0.75rem" }}>
          <div className="card-body">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">
                Filtrar por tag:
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {cloud.map((t) => {
                const cor = tagColor(t.name);
                const active = activeTags.includes(t.name);
                return (
                  <Link
                    key={t.name}
                    href={toggleTag(t.name)}
                    style={{
                      background: active ? cor : "transparent",
                      color: active ? "#fff" : cor,
                      border: `1.5px solid ${cor}`,
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: "0.73rem",
                      fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    {t.name} <span style={{ opacity: 0.65 }}>({t.qtd})</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {!livros.length ? (
        <div className="card">
          <div className="card-body py-10 text-center text-sm text-muted">
            Nenhum livro nesta prateleira.{" "}
            <Link href="/painel/livros/novo" className="text-accent-text underline">
              Cadastrar um título
            </Link>
            .
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {livros.map((l) => (
            <div key={l.id}>
              <ReadingBookCard
                bookId={l.id}
                title={l.title}
                author={l.author}
                coverUrl={l.coverUrl}
                currentPage={l.currentPage}
                pages={l.pages}
                readingStatus={l.readingStatus}
                size="md"
              />
              <div className="mt-1 flex justify-end">
                <DeleteBookButton id={l.id} title={l.title} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/painel/livros/novo"
        className="fab-novo"
        aria-label="Cadastrar livro"
      >
        +
      </Link>
    </div>
  );
}
