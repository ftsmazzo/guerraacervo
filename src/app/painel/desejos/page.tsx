import { redirect } from "next/navigation";
import { getAuthContext, hasEntitlement } from "@/lib/auth/context";
import { listWishItems } from "@/lib/wishlist/queries";
import { WishlistClient } from "./wishlist-client";

export default async function DesejosPage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/desejos");
  if (!hasEntitlement(ctx.tenant.planCode, "wishlist")) {
    redirect("/painel");
  }

  const items = await listWishItems(ctx.tenant.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Lista de desejos</h1>
      <p className="mt-1 text-sm text-muted">
        Livros que você procura. Depois cruzamos com o estoque dos sebos para
        avisos mais assertivos.
      </p>
      <div className="mt-6">
        <WishlistClient
          items={items.map((i) => ({
            id: i.id,
            isbn: i.isbn,
            title: i.title,
            author: i.author,
            notes: i.notes,
          }))}
        />
      </div>
    </div>
  );
}
