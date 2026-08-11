"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { saveReservationNotifyWhatsapp } from "@/lib/loja/settings";

export function ReservationNotifyForm({
  initialPhone,
}: {
  initialPhone: string | null;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone || "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    start(async () => {
      const res = await saveReservationNotifyWhatsapp(phone);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(
        res.phone
          ? "WhatsApp de alerta salvo."
          : "Alerta por WhatsApp desativado.",
      );
      if (res.phone) setPhone(res.phone);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-line bg-card p-5 shadow-[var(--shadow)]"
    >
      <h3 className="text-sm font-semibold text-ink">Alerta de reservas</h3>
      <p className="mt-1 text-sm text-muted">
        Número que recebe WhatsApp quando um cliente reserva um livro (agente ou
        loja). Use o celular de quem tira o livro da prateleira.
      </p>
      <label className="mt-4 block text-sm">
        <span className="text-muted">WhatsApp (com DDD)</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="11999998888"
          className="mt-1 w-full max-w-xs rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {error ? (
        <p className="mt-2 text-sm text-accent-text">{error}</p>
      ) : null}
      {ok ? <p className="mt-2 text-sm text-muted">{ok}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {phone ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPhone("");
              start(async () => {
                const res = await saveReservationNotifyWhatsapp("");
                if (!res.ok) setError(res.error);
                else setOk("Alerta por WhatsApp desativado.");
                router.refresh();
              });
            }}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-60"
          >
            Remover
          </button>
        ) : null}
      </div>
    </form>
  );
}
