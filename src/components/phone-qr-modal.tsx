"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onIsbn: (code: string) => void;
  onCoverPhoto: (dataUrl: string) => void;
};

export function PhoneQrModal({ open, onClose, onIsbn, onCoverPhoto }: Props) {
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparando…");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedRef = useRef(false);
  const onIsbnRef = useRef(onIsbn);
  const onCoverRef = useRef(onCoverPhoto);
  const onCloseRef = useRef(onClose);
  onIsbnRef.current = onIsbn;
  onCoverRef.current = onCoverPhoto;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      closedRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setScanUrl(null);
      setToken(null);
      setError(null);
      setStatus("Preparando…");
      return;
    }

    closedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        setStatus("Gerando QR…");
        const res = await fetch("/api/scan-sessions", { method: "POST" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Falha ao criar sessão");
        if (cancelled || closedRef.current) return;
        setToken(d.token);
        setScanUrl(d.scanUrl);
        setStatus("Aguardando leitura do celular…");

        pollRef.current = setInterval(async () => {
          if (closedRef.current || !d.token) return;
          try {
            const r = await fetch(`/api/scan-sessions/${d.token}/result`, {
              credentials: "include",
            });
            const body = await r.json();
            if (!r.ok) return;
            if (body.expired) {
              setStatus("QR expirado. Feche e abra de novo.");
              setError("Sessão expirada");
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }
            if (body.pending) return;
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (body.type === "isbn" && body.code) {
              setStatus("ISBN recebido!");
              onIsbnRef.current(String(body.code));
              onCloseRef.current();
            } else if (body.type === "photo" && body.imageBase64) {
              setStatus("Foto recebida!");
              onCoverRef.current(String(body.imageBase64));
              onCloseRef.current();
            }
          } catch {
            /* ignore transient poll errors */
          }
        }, 1000);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao abrir QR");
          setStatus("Falha");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const qrSrc = scanUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(scanUrl)}`
    : null;

  return (
    <div className="phone-qr-modal" role="dialog" aria-modal="true">
      <div className="phone-qr-dialog">
        <div className="phone-qr-header">
          <strong>Celular via QR</strong>
          <button
            type="button"
            className="phone-qr-close"
            onClick={() => {
              closedRef.current = true;
              onClose();
            }}
          >
            Fechar
          </button>
        </div>
        <p className="phone-qr-help">
          Escaneie com a câmera do celular. O aparelho só lê o código ou a capa —
          o formulário continua neste computador.
        </p>
        {error ? <div className="phone-qr-error">{error}</div> : null}
        <div className="phone-qr-frame">
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc} alt="QR Code do scanner" width={220} height={220} />
          ) : (
            <div className="phone-qr-loading">…</div>
          )}
        </div>
        <p className="phone-qr-status">{status}</p>
        {scanUrl ? (
          <p className="phone-qr-url" title={scanUrl}>
            {scanUrl}
          </p>
        ) : null}
        {token ? (
          <p className="phone-qr-note">
            No celular: permita a câmera. Se aparecer aviso, use Avançado → Continuar.
          </p>
        ) : null}
      </div>
    </div>
  );
}
