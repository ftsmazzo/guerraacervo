"use client";

export function PrintLabelsButton() {
  return (
    <button
      type="button"
      className="btn-accent"
      onClick={() => window.print()}
    >
      Imprimir
    </button>
  );
}
