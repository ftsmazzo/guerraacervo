"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteClient } from "@/lib/clients/actions";

export function DeleteClientButton({
  id,
  name,
  orderCount = 0,
}: {
  id: string;
  name: string;
  orderCount?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="btn-outline btn-sm btn-danger-outline"
        title="Excluir"
        onClick={() => {
          if (orderCount > 0) {
            setErr(
              "Este cliente possui pedidos. Remova os pedidos antes de excluir.",
            );
            return;
          }
          if (!confirm(`Excluir o cliente "${name}"?`)) return;
          setErr(null);
          start(async () => {
            const result = await deleteClient(id);
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
