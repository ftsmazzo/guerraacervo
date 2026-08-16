import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listAllReferralsAdmin } from "@/lib/referrals/queries";

const STATUS_LABEL: Record<string, string> = {
  signed_up: "Cadastrou",
  paid: "Pagou",
  rewarded: "Creditado",
  invalid: "Inválido",
};

export default async function AdminReferralsPage() {
  await requirePlatformAdmin();
  const rows = await listAllReferralsAdmin();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Indicações</h1>
      <p className="mt-1 text-sm text-muted">
        Quem indicou quem. Crédito só após o primeiro pagamento.
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Nenhuma indicação ainda.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Indicou</th>
                <th className="px-4 py-2">Indicada</th>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    {row.referrerName}
                    <span className="block text-xs text-muted">
                      {row.referrerSlug}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {row.referredName}
                    <span className="block text-xs text-muted">
                      {row.referredSlug}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.codeUsed}</td>
                  <td className="px-4 py-2">
                    {STATUS_LABEL[row.status] || row.status}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {row.createdAt.toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6">
        <Link href="/admin" className="text-sm text-accent-text underline">
          Voltar
        </Link>
      </p>
    </div>
  );
}
