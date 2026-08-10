"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resumeClientBot } from "@/lib/whatsapp/actions";

export function ResumeBotButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {error ? (
        <p style={{ color: "#991b1b", fontSize: "0.85rem", marginBottom: 8 }}>
          {error}
        </p>
      ) : null}
      {ok ? (
        <p style={{ color: "#166534", fontSize: "0.85rem", marginBottom: 8 }}>
          {ok}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOk(null);
          start(async () => {
            const r = await resumeClientBot(clientId);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setOk(r.message || "Bot reativado.");
            router.refresh();
          });
        }}
      >
        {pending ? "Reativando…" : "Retomar bot"}
      </button>
    </div>
  );
}
