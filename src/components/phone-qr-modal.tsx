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
  onIsbnRef.current = onIsbn;
  onCoverRef.current = onCoverPhoto;

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
            if (body.type === "isbn" && body.code) {
              setStatus("ISBN recebido. Pode ler o próximo no celular.");
              onIsbnRef.current(String(body.code));
            } else if (body.type === "photo" && body.imageBase64) {
              setStatus("Foto recebida. Pode fotografar o próximo.");
              onCoverRef.current(String(body.imageBase64));
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
          Escaneie <strong>uma vez</strong> com a câmera do celular. O QR vale
          10 minutos e renova a cada foto: cadastre o livro neste computador e
          fotografe o próximo no celular — sem fechar nem gerar outro código.
        </p>
        <p className="phone-qr-help">
          Se o PrismaBook já está no celular, abra <strong>Novo livro</strong> e
          use a câmera — não precisa deste QR.
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
