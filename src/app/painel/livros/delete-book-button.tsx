"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteBook } from "@/lib/books/actions";

export function DeleteBookButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
        onClick={() => {
          if (!confirm(`Excluir o livro "${title}"?`)) return;
          setErr(null);
          start(async () => {
            const result = await deleteBook(id);
            if (!result.ok) {
              setErr(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        Excluir
      </button>
      {err ? (
        <div className="mt-1 text-[0.7rem] text-red-700">{err}</div>
      ) : null}
    </>
  );
}
