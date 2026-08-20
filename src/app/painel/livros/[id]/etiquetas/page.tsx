import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getBook } from "@/lib/books/queries";
import { listCopiesForBook } from "@/lib/library/copies";
import { PrintLabelsButton } from "./print-button";
import "./etiquetas.css";

export default async function EtiquetasLivroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login");
  if (ctx.tenant.product !== "library") redirect("/painel/livros");
  if (!hasEntitlement(ctx.tenant.planCode, "catalog")) {
    redirect("/painel/livros");
  }

  const { id } = await params;
  const book = await getBook(ctx.tenant.id, id);
  if (!book) notFound();
  const copies = await listCopiesForBook(ctx.tenant.id, book.id);

  return (
    <div className="labels-page">
      <div className="labels-toolbar no-print">
        <div>
          <h1>Etiquetas · {book.title}</h1>
          <p>
            Layout simples para colar no exemplar. O código identifica a cópia
            no balcão (quem pegou qual livro).
          </p>
        </div>
        <div className="labels-actions">
          <Link href={`/painel/livros/${book.id}`} className="btn-outline">
            Voltar ao livro
          </Link>
          <PrintLabelsButton />
        </div>
      </div>

      {!copies.length ? (
        <p className="no-print">
          Nenhum exemplar. Ajuste a quantidade de exemplares no cadastro do
          livro.
        </p>
      ) : (
        <div className="labels-sheet">
          {copies.map((c, i) => (
            <article key={c.id} className="label-card">
              <div className="label-library">{ctx.tenant!.name}</div>
              <div className="label-title">{book.title}</div>
              {book.author ? (
                <div className="label-author">{book.author}</div>
              ) : null}
              <div className="label-code">{c.barcode}</div>
              <div className="label-meta">
                Exemplar {i + 1}/{copies.length}
                {c.location ? ` · ${c.location}` : ""}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
