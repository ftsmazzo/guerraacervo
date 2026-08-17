"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import "./reading-cover.css";
import { logPagesRead, setCurrentPage } from "@/lib/reading/actions";
import { FinishBookForm, StatusSelect } from "@/components/reading/reading-ui";
import type { ReadingStatus } from "@/lib/reading/types";

export function readingPercent(currentPage: number, pages: number | null) {
  if (!pages || pages < 1) return 0;
  return Math.min(100, Math.max(0, (currentPage / pages) * 100));
}

export function ReadingCover({
  coverUrl,
  percent,
  pages,
  currentPage,
  live = false,
  size = "md",
}: {
  coverUrl: string | null;
  percent: number;
  pages?: number | null;
  currentPage?: number;
  live?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const pct = Math.min(100, Math.max(0, percent));
  const showLine = pct > 1 && pct < 99;

  return (
    <div
      className="reading-cover"
      data-size={size}
      style={{ ["--read-pct" as string]: `${pct}%` }}
      aria-hidden={!coverUrl}
    >
      {coverUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="reading-cover-img reading-cover-unread" />
          <div className="reading-cover-fog" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            className={`reading-cover-img reading-cover-read${live ? " live" : ""}`}
          />
        </>
      ) : (
        <div className="reading-cover-placeholder">📖</div>
      )}
      {showLine ? <div className="reading-cover-line visible" /> : null}
      {pages ? (
        <span className="reading-cover-chip">
          {Math.round(currentPage ?? 0)}/{pages}
        </span>
      ) : pct > 0 ? (
        <span className="reading-cover-chip">{Math.round(pct)}%</span>
      ) : null}
    </div>
  );
}

export function ReadingBookCard({
  bookId,
  title,
  author,
  coverUrl,
  currentPage,
  pages,
  readingStatus,
  size = "md",
  showStatus = true,
  showFinish = true,
  href,
}: {
  bookId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  currentPage: number;
  pages: number | null;
  readingStatus?: ReadingStatus;
  size?: "sm" | "md" | "lg";
  showStatus?: boolean;
  showFinish?: boolean;
  href?: string;
}) {
  const router = useRouter();
  const max = pages && pages > 0 ? pages : Math.max(currentPage + 50, 100);
  const [value, setValue] = useState(String(currentPage));
  const [live, setLive] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [logPages, setLogPages] = useState("10");
  const [pending, start] = useTransition();

  useEffect(() => {
    setValue(String(currentPage));
  }, [currentPage]);

  const pageNum = Number(value) || 0;
  const pct = readingPercent(pageNum, pages);

  function commit(next: number) {
    setLive(false);
    setErr(null);
    start(async () => {
      const result = await setCurrentPage(bookId, next);
      if (!result.ok) {
        setErr(result.error ?? "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className="flex gap-3 rounded-xl border border-line bg-card p-3 shadow-[var(--shadow)]">
      <Link href={href || `/painel/livros/${bookId}`} className="shrink-0">
        <ReadingCover
          coverUrl={coverUrl}
          percent={pct}
          pages={pages}
          currentPage={pageNum}
          live={live}
          size={size}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={href || `/painel/livros/${bookId}`}
          className="truncate text-sm font-semibold text-ink hover:underline"
          title={title}
        >
          {title}
        </Link>
        <p className="truncate text-xs text-muted">{author || "—"}</p>
        {showStatus && readingStatus ? (
          <div className="mt-2">
            <StatusSelect bookId={bookId} value={readingStatus} />
          </div>
        ) : null}
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Página {value}
              {pages ? ` de ${pages}` : ""}
            </span>
            <span>{Math.round(pct)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={max}
            value={value}
            disabled={pending}
            aria-label="Página atual"
            onPointerDown={() => setLive(true)}
            onChange={(e) => {
              setLive(true);
              setValue(e.target.value);
            }}
            onPointerUp={(e) =>
              commit(Number((e.currentTarget as HTMLInputElement).value))
            }
            className="mt-1 w-full accent-[var(--brand-amber)]"
          />
        </div>
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            start(async () => {
              const result = await logPagesRead({
                bookId,
                pages: Number(logPages),
              });
              if (!result.ok) {
                setErr(result.error ?? "Não foi possível salvar.");
                return;
              }
              router.refresh();
            });
          }}
        >
          <input
            type="number"
            min={1}
            max={2000}
            value={logPages}
            onChange={(e) => setLogPages(e.target.value)}
            className="w-16 rounded-md border border-line px-2 py-1.5 text-sm"
            aria-label="Páginas lidas hoje"
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-9 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {pending ? "…" : "Li estas páginas"}
          </button>
        </form>
        {showFinish && readingStatus !== "lido" ? (
          <div className="mt-2">
            <FinishBookForm bookId={bookId} title={title} />
          </div>
        ) : null}
        {err ? <p className="mt-1 text-xs text-red-700">{err}</p> : null}
      </div>
    </article>
  );
}
