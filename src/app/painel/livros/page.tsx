import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { listBooks, listTagCloud } from "@/lib/books/queries";
import { DeleteBookButton } from "./delete-book-button";
import "./livros.css";

export const dynamic = "force-dynamic";

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

function money(v: string | number) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function condBadge(c: string) {
  const map: Record<string, string> = {
    Novo: "#166534",
    Ótimo: "#1d4ed8",
    Bom: "#a16207",
    Regular: "#9a3412",
  };
  return (
    <span
      className="badge-cond"
      style={{ background: "#fff", border: `1px solid ${map[c] || "#ccc"}`, color: map[c] || "#444" }}
    >
      {c}
    </span>
  );
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

export default async function LivrosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/livros");
  if (!hasEntitlement(ctx.tenant.planCode, "catalog")) {
    return (
      <div className="livros-page">
        <h1 className="text-2xl font-semibold text-ink">Livros</h1>
        <p className="mt-3 text-sm text-muted">
          Seu plano não inclui o catálogo.
        </p>
      </div>
    );
  }

  const isPersonal = ctx.tenant.product === "personal";

  const sp = await searchParams;
  const busca = sp.busca?.trim() || "";
  const estado = sp.estado || "";
  const disponivel = sp.disponivel || "";
  const activeTags = (sp.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const order = (sp.order as
    | "title"
    | "author"
    | "salePrice"
    | "stock"
    | "createdAt"
    | undefined) || "createdAt";
  const dir = sp.dir === "asc" ? "asc" : "desc";

  const base: Record<string, string> = {};
  if (busca) base.busca = busca;
  if (estado) base.estado = estado;
  if (disponivel) base.disponivel = disponivel;
  if (activeTags.length) base.tags = activeTags.join(",");
  if (order !== "createdAt") base.order = order;
  if (dir !== "desc") base.dir = dir;

  let livros: Awaited<ReturnType<typeof listBooks>> = [];
  let cloud: Awaited<ReturnType<typeof listTagCloud>> = [];
  let loadError: string | null = null;
  try {
    [livros, cloud] = await Promise.all([
      listBooks(ctx.tenant.id, {
        busca,
        estado,
        disponivel,
        tags: activeTags,
        order,
        dir,
      }),
      listTagCloud(ctx.tenant.id, { activeTags }),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

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
          <div className="card-body">
            Falha ao carregar livros: {loadError}
          </div>
        </div>
      ) : null}
      <div className="page-header">
        <div>
          <h4>
            <span style={{ color: "var(--accent)", marginRight: 8 }}>📚</span>
            Livros
          </h4>
          <small className="text-muted">
            {livros.length} registro(s)
            {activeTags.length
              ? ` · filtrando por ${activeTags.length} tag(s)`
              : ""}
          </small>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/painel/livros/lote" className="btn-accent" style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}>
            Foto da mesa
          </Link>
          <Link href="/painel/livros/novo" className="btn-accent">
            + Novo Livro
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "0.75rem" }}>
        <div className="card-body" style={{ padding: "0.6rem 1rem" }}>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            {activeTags.length ? (
              <input type="hidden" name="tags" value={activeTags.join(",")} />
            ) : null}
            <div style={{ flex: "1 1 220px" }}>
              <input
                name="busca"
                defaultValue={busca}
                className="form-control"
                placeholder="Título, autor, ISBN, editora…"
              />
            </div>
            <select
              name="estado"
              defaultValue={estado}
              className="form-select"
              style={{ width: 160 }}
            >
              <option value="">Todos os estados</option>
              {["Novo", "Ótimo", "Bom", "Regular"].map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              name="disponivel"
              defaultValue={disponivel}
              className="form-select"
              style={{ width: 160 }}
            >
              <option value="">Disponibilidade</option>
              <option value="1">Disponíveis</option>
              <option value="0">Reservados</option>
              <option value="esgotado">Esgotados</option>
            </select>
            <button className="btn-accent" type="submit">
              Filtrar
            </button>
            <Link
              href="/painel/livros"
              className="rounded-md border border-line px-3 py-2 text-sm"
            >
              Limpar tudo
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
              {activeTags.length ? (
                <Link
                  href={buildHref(base, { tags: undefined })}
                  className="text-xs text-red-700"
                >
                  Remover {activeTags.length} tag(s)
                </Link>
              ) : null}
            </div>
            {activeTags.length ? (
              <div
                className="mb-2 flex flex-wrap gap-1 pb-2"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                {activeTags.map((at) => (
                  <Link
                    key={at}
                    href={toggleTag(at)}
                    className="tag-pill"
                    style={{ background: tagColor(at) }}
                  >
                    {at} ×
                  </Link>
                ))}
              </div>
            ) : null}
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
                    {t.name}{" "}
                    <span style={{ opacity: 0.65 }}>({t.qtd})</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="livros-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Capa</th>
                  <th>
                    <Link
                      href={buildHref(base, {
                        order: "title",
                        dir:
                          order === "title" && dir === "asc" ? "desc" : "asc",
                      })}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      Título
                    </Link>
                  </th>
                  <th>Autor</th>
                  <th>Tags</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th className="text-center">Pág.</th>
                  {isPersonal ? null : (
                    <>
                      <th className="text-end">Preço Venda</th>
                      <th className="text-center">Estoque</th>
                      <th className="text-center">Disponível</th>
                      <th>Localização</th>
                    </>
                  )}
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {!livros.length ? (
                  <tr>
                    <td
                      colSpan={isPersonal ? 8 : 12}
                      className="py-10 text-center text-muted"
                    >
                      Nenhum livro encontrado.
                    </td>
                  </tr>
                ) : (
                  livros.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.coverUrl}
                            alt=""
                            className="book-cover"
                          />
                        ) : (
                          <div className="book-cover-placeholder">📖</div>
                        )}
                      </td>
                      <td>
                        <div className="fw-semibold" title={l.title}>
                          {l.title.length > 45
                            ? `${l.title.slice(0, 45)}…`
                            : l.title}
                        </div>
                        <small className="text-muted">
                          {l.publisher || ""}
                          {l.year ? ` · ${l.year}` : ""}
                        </small>
                      </td>
                      <td className="text-muted">{l.author || "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {l.tagsList.slice(0, 3).map((tg) => {
                            const cor = tagColor(tg);
                            const active = activeTags.includes(tg);
                            return (
                              <Link
                                key={tg}
                                href={toggleTag(tg)}
                                style={{
                                  background: active ? cor : "transparent",
                                  color: active ? "#fff" : cor,
                                  border: `1.2px solid ${cor}`,
                                  borderRadius: 20,
                                  padding: "1px 7px",
                                  fontSize: "0.67rem",
                                  textDecoration: "none",
                                }}
                              >
                                {tg}
                              </Link>
                            );
                          })}
                          {!l.tagsList.length ? (
                            <span className="text-muted">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{condBadge(l.condition)}</td>
                      <td>
                        <span className="rounded border border-line px-2 py-0.5 text-xs">
                          {l.coverType}
                        </span>
                      </td>
                      <td className="text-center text-muted">
                        {l.pages ?? "—"}
                      </td>
                      {isPersonal ? null : (
                        <>
                      <td className="text-end fw-semibold">
                        {money(l.salePrice)}
                      </td>
                      <td className="text-center">
                        <span className="fw-semibold">{l.stock}</span>
                        {l.reserved > 0 ? (
                          <>
                            <br />
                            <small className="text-amber-700">
                              reserv. {l.reserved}
                            </small>
                          </>
                        ) : null}
                      </td>
                      <td className="text-center">
                        {l.available > 0 ? (
                          <span className="badge-disponivel">
                            Disp. {l.available}
                          </span>
                        ) : l.stock > 0 && l.reserved > 0 ? (
                          <span className="badge-reservado">Reservado</span>
                        ) : (
                          <span className="badge-esgotado">Esgotado</span>
                        )}
                      </td>
                      <td className="text-muted">{l.location || "—"}</td>
                        </>
                      )}
                      <td className="text-center">
                        <Link
                          href={`/painel/livros/${l.id}`}
                          className="mr-1 rounded border border-line px-2 py-1 text-xs"
                        >
                          Editar
                        </Link>
                        <DeleteBookButton id={l.id} title={l.title} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
