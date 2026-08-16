"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTenantAccount } from "@/app/admin/actions";

type Props = {
  tenantId: string;
  tenantName: string;
  /** Depois de excluir, ir para a lista de contas. */
  redirectToList?: boolean;
};

export function DeleteTenantButton({
  tenantId,
  tenantName,
  redirectToList = false,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60"
      onClick={() => {
        const ok = window.confirm(
          `Excluir "${tenantName}" e todos os dados ligados (livros, pedidos, clientes, WhatsApp e usuários só desta conta)? Esta ação não pode ser desfeita.`,
        );
        if (!ok) return;
        start(async () => {
          const res = await deleteTenantAccount(tenantId);
          if (!res.ok) {
            window.alert(res.error);
            return;
          }
          if (redirectToList) {
            router.push("/admin/tenants");
            router.refresh();
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "Excluindo…" : "Excluir"}
    </button>
  );
}
