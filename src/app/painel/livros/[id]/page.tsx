import { notFound, redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { getBook } from "@/lib/books/queries";
import { listCopiesForBook } from "@/lib/library/copies";
import { ReadingBookCard } from "@/components/reading/reading-cover";
import { BookForm } from "../book-form";
import "../livros.css";

export default async function EditarLivroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/livros");
  if (!hasEntitlement(ctx.tenant.planCode, "catalog")) {
    redirect("/painel/livros");
  }
  const { id } = await params;
  const book = await getBook(ctx.tenant.id, id);
  if (!book) notFound();
  const personal = ctx.tenant.product === "personal";
  const library = ctx.tenant.product === "library";
  const copies = library
    ? await listCopiesForBook(ctx.tenant.id, book.id)
    : [];

  return (
    <div>
      {personal ? (
        <div className="mb-4">
          <ReadingBookCard
            bookId={book.id}
            title={book.title}
            author={book.author}
            coverUrl={book.coverUrl}
            currentPage={book.currentPage}
            pages={book.pages}
            readingStatus={book.readingStatus}
            size="lg"
          />
        </div>
      ) : null}
    <BookForm
      personal={personal}
      library={library}
      copies={copies}
      initial={{
        id: book.id,
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        year: book.year,
        synopsis: book.synopsis,
        pages: book.pages,
        coverUrl: book.coverUrl,
        genre: book.genre,
        language: book.language,
        weightGrams: book.weightGrams,
        condition: book.condition,
        coverType: book.coverType,
        purchasePrice: book.purchasePrice,
        salePrice: book.salePrice,
        stock: book.stock,
        reserved: book.reserved,
        available: book.available,
        location: book.location,
        tagsList: book.tagsList,
        createdAt: book.createdAt.toISOString(),
        updatedAt: book.updatedAt.toISOString(),
      }}
    />
    </div>
  );
}
