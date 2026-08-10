export default function PainelDashboardPage() {
  const cards = [
    { label: "Títulos", value: "—" },
    { label: "Clientes", value: "—" },
    { label: "Pedidos abertos", value: "—" },
    { label: "Receita do mês", value: "—" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Shell do operacional. Conectar queries ao Postgres na próxima etapa.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-line bg-card p-4"
          >
            <p className="text-xs text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
