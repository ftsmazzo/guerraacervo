"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  commentOnPost,
  finishBook,
  logPagesRead,
  saveReadingPlan,
  setCurrentPage,
  setReadingStatus,
} from "@/lib/reading/actions";
import {
  READING_STATUS_LABEL,
  type ReadingStatus,
} from "@/lib/reading/types";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700">{message}</p>;
}

function failMessage(error: string | undefined) {
  return error ?? "Não foi possível salvar.";
}

export function LogPagesForm({
  bookId,
  compact = false,
}: {
  bookId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pages, setPages] = useState("10");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className={`flex flex-wrap items-end gap-2 ${compact ? "" : "mt-2"}`}
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const result = await logPagesRead({
            bookId,
            pages: Number(pages),
          });
          if (!result.ok) {
            setErr(failMessage(result.error));
            return;
          }
          router.refresh();
        });
      }}
    >
      <label className="text-xs font-medium text-ink">
        Páginas de hoje
        <input
          type="number"
          min={1}
          max={2000}
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          className="mt-1 block w-24 rounded-md border border-line px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-9 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? "…" : "Marquei páginas"}
      </button>
      <ErrorText message={err} />
    </form>
  );
}

export function PageSlider({
  bookId,
  currentPage,
  pages,
}: {
  bookId: string;
  currentPage: number;
  pages: number | null;
}) {
  const router = useRouter();
  const max = pages && pages > 0 ? pages : Math.max(currentPage + 50, 100);
  const [value, setValue] = useState(String(currentPage));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function commit(next: number) {
    setErr(null);
    start(async () => {
      const result = await setCurrentPage(bookId, next);
      if (!result.ok) {
        setErr(failMessage(result.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Página {value}
          {pages ? ` de ${pages}` : ""}
        </span>
        {pages ? (
          <span>{Math.min(100, Math.round((Number(value) / pages) * 100))}%</span>
        ) : null}
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onPointerUp={(e) =>
          commit(Number((e.currentTarget as HTMLInputElement).value))
        }
        onKeyUp={(e) => {
          if (
            e.key === "Enter" ||
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight"
          ) {
            commit(Number((e.currentTarget as HTMLInputElement).value));
          }
        }}
        className="mt-1 w-full accent-[var(--accent)]"
      />
      <ErrorText message={err} />
    </div>
  );
}

export function StatusSelect({
  bookId,
  value,
}: {
  bookId: string;
  value: ReadingStatus;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <select
        disabled={pending}
        defaultValue={value}
        className="rounded-md border border-line bg-card px-2 py-1.5 text-xs"
        onChange={(e) => {
          const next = e.target.value as ReadingStatus;
          setErr(null);
          start(async () => {
            const result = await setReadingStatus(bookId, next);
            if (!result.ok) {
              setErr(failMessage(result.error));
              return;
            }
            router.refresh();
          });
        }}
      >
        {(
          ["quero_ler", "lendo", "lido", "abandonado"] as ReadingStatus[]
        ).map((s) => (
          <option key={s} value={s}>
            {READING_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ErrorText message={err} />
    </div>
  );
}

export function FinishBookForm({
  bookId,
  title,
}: {
  bookId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [share, setShare] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-background"
      >
        Concluí
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-line bg-background p-3">
      <p className="text-sm font-medium text-ink">Terminou {title}?</p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Como foi a leitura? Uma frase já entra no mural."
        className="mt-2 w-full rounded-md border border-line px-2 py-1.5 text-sm"
      />
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
        />
        Postar na comunidade
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          onClick={() => {
            setErr(null);
            start(async () => {
              const result = await finishBook({ bookId, body, share });
              if (!result.ok) {
                setErr(failMessage(result.error));
                return;
              }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {pending ? "Salvando…" : share ? "Concluir e postar" : "Só marcar lido"}
        </button>
        <button
          type="button"
          className="text-xs text-muted underline"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      <ErrorText message={err} />
    </div>
  );
}

export function ReadingPlanForm({
  dailyPages,
  remindAt,
  enabled,
}: {
  dailyPages: number;
  remindAt: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pages, setPages] = useState(String(dailyPages));
  const [time, setTime] = useState(remindAt);
  const [on, setOn] = useState(enabled);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-4 grid max-w-md gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        start(async () => {
          const result = await saveReadingPlan({
            dailyPages: Number(pages),
            remindAt: time,
            enabled: on,
          });
          if (!result.ok) {
            setErr(failMessage(result.error));
            return;
          }
          setOk(true);
          router.refresh();
        });
      }}
    >
      <label className="text-sm font-medium text-ink">
        Meta diária (páginas)
        <input
          type="number"
          min={1}
          max={500}
          value={pages}
          onChange={(e) => setPages(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm font-medium text-ink">
        Horário do lembrete
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <span className="mt-1 block font-normal text-xs text-muted">
          Se não registrar leitura até esse horário, o celular avisa.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        Lembrete ligado
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar plano"}
      </button>
      {ok ? (
        <p className="text-sm text-green-800">Plano atualizado.</p>
      ) : null}
      <ErrorText message={err} />
    </form>
  );
}

export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-2 flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const result = await commentOnPost(postId, body);
          if (!result.ok) {
            setErr(failMessage(result.error));
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
    >
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={500}
        placeholder="Comentar…"
        className="min-w-[12rem] flex-1 rounded-md border border-line px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending || body.trim().length < 2}
        className="rounded-md border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        {pending ? "…" : "Enviar"}
      </button>
      <ErrorText message={err} />
    </form>
  );
}
