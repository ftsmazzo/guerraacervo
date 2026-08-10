function StubModule({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 max-w-xl text-sm text-muted">{blurb}</p>
      <div className="mt-6 rounded-lg border border-dashed border-line bg-card p-8 text-sm text-muted">
        Módulo stub — CRUD e regras vêm do legado PHP (`app/`) portados para
        esta API.
      </div>
    </div>
  );
}

export default function LivrosPage() {
  return (
    <StubModule
      title="Livros"
      blurb="Catálogo com ISBN, estoque, conservação e limite por plano."
    />
  );
}
