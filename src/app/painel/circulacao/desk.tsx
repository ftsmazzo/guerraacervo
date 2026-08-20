"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  checkoutLoan,
  quickCreateReader,
  renewLoan,
  returnLoan,
  saveLibraryPolicy,
  searchCirculationCopies,
  searchCirculationReaders,
} from "@/lib/library/actions";
import {
  EMPTY_LOAN_CONDITION,
  LOAN_CONDITION_LABELS,
  fileToLoanPhotoDataUrl,
} from "@/lib/library/condition";
import type { CirculationLoan, CopySearchHit, ReaderSearchHit } from "@/lib/library/queries";
import type { LibraryPolicy } from "@/lib/library/policy";
import type { LoanConditionCheck } from "@/db/schema";

function fmtDate(d: Date | string) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("pt-BR");
}

function dueClass(loan: CirculationLoan) {
  if (loan.status === "overdue") return "text-red-700";
  const ms = new Date(loan.dueAt).getTime() - Date.now();
  if (ms < 1000 * 60 * 60 * 24) return "text-amber-800";
  return "text-muted";
}

function ConditionChecklist({
  value,
  onChange,
  photo,
  onPhoto,
  title,
}: {
  value: LoanConditionCheck;
  onChange: (next: LoanConditionCheck) => void;
  photo: string | null;
  onPhoto: (dataUrl: string | null) => void;
  title: string;
}) {
  return (
    <div className="mt-3 rounded-md border border-line p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted">
        Folheada rápida + foto do livro (opcional, mas recomendada).
      </p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {LOAN_CONDITION_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) =>
                onChange({ ...value, [key]: e.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <label className="mt-2 block text-sm">
        Observação
        <input
          className="form-control mt-1"
          value={value.notes}
          maxLength={500}
          placeholder="Ex.: canto amassado na capa"
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="btn-outline cursor-pointer text-xs">
          Tirar / escolher foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void (async () => {
                try {
                  onPhoto(await fileToLoanPhotoDataUrl(file));
                } catch (err) {
                  alert(
                    err instanceof Error ? err.message : "Falha na foto",
                  );
                }
              })();
            }}
          />
        </label>
        {photo ? (
          <button
            type="button"
            className="text-xs text-muted underline"
            onClick={() => onPhoto(null)}
          >
            Remover foto
          </button>
        ) : null}
      </div>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt="Conferência"
          className="mt-2 max-h-40 rounded border border-line object-contain"
        />
      ) : null}
    </div>
  );
}

export function CirculationDesk({
  initialLoans,
  policy,
}: {
  initialLoans: CirculationLoan[];
  policy: LibraryPolicy;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [readerQ, setReaderQ] = useState("");
  const [readers, setReaders] = useState<ReaderSearchHit[]>([]);
  const [reader, setReader] = useState<ReaderSearchHit | null>(null);
  const [newName, setNewName] = useState("");
  const [newWa, setNewWa] = useState("");

  const [bookQ, setBookQ] = useState("");
  const [copies, setCopies] = useState<CopySearchHit[]>([]);
  const [copy, setCopy] = useState<CopySearchHit | null>(null);

  const [checkoutCondition, setCheckoutCondition] =
    useState<LoanConditionCheck>({ ...EMPTY_LOAN_CONDITION });
  const [checkoutPhoto, setCheckoutPhoto] = useState<string | null>(null);

  const [returnLoanId, setReturnLoanId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState<LoanConditionCheck>({
    ...EMPTY_LOAN_CONDITION,
  });
  const [returnPhoto, setReturnPhoto] = useState<string | null>(null);

  const [loanDays, setLoanDays] = useState(String(policy.loanDays));
  const [maxOpen, setMaxOpen] = useState(String(policy.maxOpenLoans));
  const [maxRenew, setMaxRenew] = useState(String(policy.maxRenewals));

  const duePreview = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Number(loanDays || policy.loanDays));
    return fmtDate(d);
  }, [loanDays, policy.loanDays]);

  function runSearchReaders(q: string) {
    setReaderQ(q);
    if (q.trim().length < 2) {
      setReaders([]);
      return;
    }
    start(async () => {
      setReaders(await searchCirculationReaders(q));
    });
  }

  function runSearchCopies(q: string) {
    setBookQ(q);
    if (q.trim().length < 2) {
      setCopies([]);
      return;
    }
    start(async () => {
      setCopies(await searchCirculationCopies(q));
    });
  }

  function confirmCheckout() {
    if (!reader || !copy) return;
    setError(null);
    setOkMsg(null);
    start(async () => {
      const res = await checkoutLoan({
        clientId: reader.id,
        copyId: copy.copyId || undefined,
        bookId: copy.bookId,
        photoUrl: checkoutPhoto,
        condition: checkoutCondition,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOkMsg(
        `Emprestado até ${res.dueAt ? fmtDate(res.dueAt) : duePreview}.`,
      );
      setCopy(null);
      setBookQ("");
      setCopies([]);
      setCheckoutCondition({ ...EMPTY_LOAN_CONDITION });
      setCheckoutPhoto(null);
      router.refresh();
    });
  }

  function openReturn(loanId: string) {
    setReturnLoanId(loanId);
    setReturnCondition({ ...EMPTY_LOAN_CONDITION });
    setReturnPhoto(null);
    setError(null);
  }

  function confirmReturn() {
    if (!returnLoanId) return;
    setError(null);
    start(async () => {
      const res = await returnLoan(returnLoanId, {
        photoUrl: returnPhoto,
        condition: returnCondition,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOkMsg("Devolvido com conferência.");
      setReturnLoanId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {okMsg ? (
        <p className="rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-accent-text">
          {okMsg}
        </p>
      ) : null}

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-sm font-semibold text-ink">1 · Leitor</h2>
        <input
          className="form-control mt-2"
          placeholder="Buscar por nome, WhatsApp ou e-mail…"
          value={readerQ}
          onChange={(e) => runSearchReaders(e.target.value)}
        />
        {readers.length ? (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {readers.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    reader?.id === r.id ? "bg-accent-soft" : "hover:bg-bg"
                  }`}
                  onClick={() => setReader(r)}
                >
                  <span>
                    <strong>{r.name}</strong>
                    {r.whatsapp ? (
                      <span className="text-muted"> · {r.whatsapp}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted">
                    {r.openLoans} aberto(s)
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {reader ? (
          <p className="mt-2 text-sm text-ink">
            Selecionado: <strong>{reader.name}</strong>
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className="form-control"
            placeholder="Novo leitor — nome"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="form-control"
            placeholder="WhatsApp (opcional)"
            value={newWa}
            onChange={(e) => setNewWa(e.target.value)}
          />
          <button
            type="button"
            className="btn-outline"
            disabled={pending || newName.trim().length < 2}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await quickCreateReader({
                  nome: newName,
                  whatsapp: newWa || null,
                });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setReader({
                  id: res.id,
                  name: newName.trim(),
                  whatsapp: newWa.replace(/\D/g, "") || null,
                  email: null,
                  openLoans: 0,
                });
                setNewName("");
                setNewWa("");
                setOkMsg("Leitor criado.");
                router.refresh();
              });
            }}
          >
            Criar
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-sm font-semibold text-ink">
          2 · Livro ou código do exemplar
        </h2>
        <input
          className="form-control mt-2"
          placeholder="Título, ISBN ou código do exemplar…"
          value={bookQ}
          onChange={(e) => runSearchCopies(e.target.value)}
        />
        {copies.length ? (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {copies.map((c) => (
              <li key={`${c.bookId}-${c.copyId || "title"}`}>
                <button
                  type="button"
                  className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm ${
                    copy?.bookId === c.bookId && copy?.copyId === c.copyId
                      ? "bg-accent-soft"
                      : "hover:bg-bg"
                  }`}
                  onClick={() => setCopy(c)}
                  disabled={c.availableCount < 1}
                >
                  <span>
                    <strong>{c.title}</strong>
                    {c.author ? (
                      <span className="text-muted"> · {c.author}</span>
                    ) : null}
                    {c.barcode ? (
                      <div className="font-mono text-xs text-muted">
                        {c.barcode}
                      </div>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {c.availableCount} disp.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {copy ? (
          <p className="mt-2 text-sm text-ink">
            Selecionado: <strong>{copy.title}</strong>
            {copy.barcode ? ` · ${copy.barcode}` : ""} · vence em {duePreview}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-sm font-semibold text-ink">3 · Confirmar entrega</h2>
        <p className="mt-1 text-sm text-muted">
          Prazo padrão: {policy.loanDays} dia(s) · até {policy.maxOpenLoans}{" "}
          empréstimos · {policy.maxRenewals} renovação(ões).
        </p>
        {reader && copy ? (
          <ConditionChecklist
            title="Conferência na entrega"
            value={checkoutCondition}
            onChange={setCheckoutCondition}
            photo={checkoutPhoto}
            onPhoto={setCheckoutPhoto}
          />
        ) : null}
        <button
          type="button"
          className="btn-accent mt-3"
          disabled={pending || !reader || !copy || copy.availableCount < 1}
          onClick={confirmCheckout}
        >
          {pending ? "Salvando…" : "Emprestar"}
        </button>
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-sm font-semibold text-ink">Abertos e atrasados</h2>
        {!initialLoans.length ? (
          <p className="mt-2 text-sm text-muted">Nenhum empréstimo aberto.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1">Leitor</th>
                  <th className="py-1">Título</th>
                  <th className="py-1">Código</th>
                  <th className="py-1">Vence</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {initialLoans.map((loan) => (
                  <tr key={loan.id} className="border-t border-line">
                    <td className="py-2">
                      {loan.readerName}
                      {loan.readerWhatsapp ? (
                        <div className="text-xs text-muted">
                          {loan.readerWhatsapp}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2">{loan.title}</td>
                    <td className="py-2 font-mono text-xs">{loan.barcode}</td>
                    <td className={`py-2 ${dueClass(loan)}`}>
                      {fmtDate(loan.dueAt)}
                      {loan.status === "overdue" ? " · atrasado" : ""}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="btn-outline mr-1 text-xs"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          start(async () => {
                            const res = await renewLoan(loan.id);
                            if (!res.ok) setError(res.error);
                            else {
                              setOkMsg("Renovado.");
                              router.refresh();
                            }
                          });
                        }}
                      >
                        Renovar
                      </button>
                      <button
                        type="button"
                        className="btn-accent text-xs"
                        disabled={pending}
                        onClick={() => openReturn(loan.id)}
                      >
                        Devolver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {returnLoanId ? (
          <div className="mt-4 rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">
                Conferência na devolução
              </h3>
              <button
                type="button"
                className="text-xs text-muted underline"
                onClick={() => setReturnLoanId(null)}
              >
                Cancelar
              </button>
            </div>
            <ConditionChecklist
              title="Estado do exemplar ao devolver"
              value={returnCondition}
              onChange={setReturnCondition}
              photo={returnPhoto}
              onPhoto={setReturnPhoto}
            />
            <button
              type="button"
              className="btn-accent mt-3"
              disabled={pending}
              onClick={confirmReturn}
            >
              {pending ? "Salvando…" : "Confirmar devolução"}
            </button>
          </div>
        ) : null}
      </section>

      <details className="rounded-lg border border-line bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium text-ink">
          Política da casa
        </summary>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await saveLibraryPolicy({
                loanDays: Number(loanDays),
                maxOpenLoans: Number(maxOpen),
                maxRenewals: Number(maxRenew),
              });
              if (!res.ok) setError(res.error);
              else {
                setOkMsg("Política salva.");
                router.refresh();
              }
            });
          }}
        >
          <label>
            Prazo (dias)
            <input
              className="form-control mt-1"
              type="number"
              min={1}
              max={90}
              value={loanDays}
              onChange={(e) => setLoanDays(e.target.value)}
            />
          </label>
          <label>
            Máx. abertos
            <input
              className="form-control mt-1"
              type="number"
              min={1}
              max={20}
              value={maxOpen}
              onChange={(e) => setMaxOpen(e.target.value)}
            />
          </label>
          <label>
            Máx. renovações
            <input
              className="form-control mt-1"
              type="number"
              min={0}
              max={10}
              value={maxRenew}
              onChange={(e) => setMaxRenew(e.target.value)}
            />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" className="btn-outline" disabled={pending}>
              Salvar política
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
