"use client";

import { useState } from "react";

export function IndiqueClient({
  code,
  seboUrl,
  userUrl,
}: {
  code: string;
  seboUrl: string;
  userUrl: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-lg border border-line bg-card p-4 text-sm">
      <p>
        Seu código:{" "}
        <strong className="font-mono text-lg tracking-wide">{code}</strong>
      </p>
      <div className="space-y-2">
        <p className="text-muted">Link para sebo</p>
        <div className="flex gap-2">
          <input
            readOnly
            className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
            value={seboUrl}
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-line px-3 py-2"
            onClick={() => void copy("sebo", seboUrl)}
          >
            {copied === "sebo" ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="text-muted">Link para leitor</p>
        <div className="flex gap-2">
          <input
            readOnly
            className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
            value={userUrl}
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-line px-3 py-2"
            onClick={() => void copy("user", userUrl)}
          >
            {copied === "user" ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
