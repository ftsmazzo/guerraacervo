"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import "./mobile-scan.css";

type Mode = "barcode" | "cover";

type ZXingReader = {
  listVideoInputDevices: () => Promise<MediaDeviceInfo[]>;
  decodeFromVideoDevice: (
    deviceId: string | null,
    video: HTMLVideoElement,
    cb: (result: { getText: () => string } | undefined, err: unknown) => void,
  ) => Promise<void>;
  reset: () => void;
};

declare global {
  interface Window {
    ZXing?: {
      BrowserMultiFormatReader: new () => ZXingReader;
    };
  }
}

async function loadZXing() {
  if (window.ZXing) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar scanner"));
    document.body.appendChild(s);
  });
}

function compressFrame(video: HTMLVideoElement, maxSide = 640): string {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(video, 0, 0, w, h);
  let q = 0.7;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > 700_000 && q > 0.4) {
    q -= 0.1;
    out = canvas.toDataURL("image/jpeg", q);
  }
  return out;
}

export default function MobileScanPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [status, setStatus] = useState<"loading" | "ready" | "sent" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Validando sessão…");
  const [mode, setMode] = useState<Mode>("barcode");
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<ZXingReader | null>(null);
  const sentRef = useRef(false);

  const stopCam = useCallback(() => {
    try {
      readerRef.current?.reset();
    } catch {
      /* ignore */
    }
    readerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const sendResult = useCallback(
    async (body: { type: "isbn"; code: string } | { type: "photo"; imageBase64: string }) => {
      if (sentRef.current || sending) return;
      setSending(true);
      try {
        const res = await fetch(`/api/scan-sessions/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Falha ao enviar");
        sentRef.current = true;
        stopCam();
        setStatus("sent");
        setMessage(
          body.type === "isbn"
            ? `ISBN enviado: ${body.code}`
            : "Foto enviada para o computador",
        );
        try {
          navigator.vibrate?.(50);
        } catch {
          /* ignore */
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao enviar");
        setSending(false);
      }
    },
    [sending, stopCam, token],
  );

  const startBarcode = useCallback(async () => {
    stopCam();
    sentRef.current = false;
    setPreview(null);
    await loadZXing();
    const reader = new window.ZXing!.BrowserMultiFormatReader();
    readerRef.current = reader;
    const devices = await reader.listVideoInputDevices();
    const preferred =
      devices.find((d) => /back|rear|traseira|environment/i.test(d.label))
        ?.deviceId ||
      devices[0]?.deviceId ||
      null;
    const video = videoRef.current;
    if (!video) return;
    await reader.decodeFromVideoDevice(preferred, video, (result) => {
      if (!result || sentRef.current) return;
      const code = result.getText();
      void sendResult({ type: "isbn", code });
    });
  }, [sendResult, stopCam]);

  const startCover = useCallback(async () => {
    stopCam();
    sentRef.current = false;
    setPreview(null);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    await video.play();
  }, [stopCam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/scan-sessions/${token}`);
        const d = await res.json();
        if (!res.ok || !d.ok) {
          throw new Error(d.error || "Sessão inválida");
        }
        if (cancelled) return;
        setStatus("ready");
        setMessage("Aponte o código de barras");
        await startBarcode();
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            e instanceof Error
              ? e.message
              : "QR expirado. Gere outro no computador.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      stopCam();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function switchMode(next: Mode) {
    if (status !== "ready" || sending) return;
    setMode(next);
    setMessage(
      next === "barcode"
        ? "Aponte o código de barras"
        : "Enquadre a capa e fotografe",
    );
    try {
      if (next === "barcode") await startBarcode();
      else await startCover();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro na câmera");
    }
  }

  function shoot() {
    const video = videoRef.current;
    if (!video) return;
    try {
      const data = compressFrame(video);
      setPreview(data);
      video.pause();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao fotografar");
    }
  }

  function retake() {
    setPreview(null);
    const video = videoRef.current;
    if (video?.srcObject) void video.play();
    else void startCover();
  }

  if (status === "loading") {
    return (
      <main className="ms-page">
        <p className="ms-msg">{message}</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="ms-page">
        <h1>Scanner</h1>
        <p className="ms-msg error">{message}</p>
        <p className="ms-hint">Volte ao PC e abra um novo QR.</p>
      </main>
    );
  }

  if (status === "sent") {
    return (
      <main className="ms-page sent">
        <div className="ms-check">✓</div>
        <h1>Enviado</h1>
        <p className="ms-msg">{message}</p>
        <p className="ms-hint">Pode voltar ao computador — a ficha já atualiza.</p>
      </main>
    );
  }

  return (
    <main className="ms-page">
      <header className="ms-header">
        <strong>PrismaBook</strong>
        <span>Leitor do celular</span>
      </header>

      <div className="ms-modes">
        <button
          type="button"
          className={mode === "barcode" ? "active" : ""}
          onClick={() => void switchMode("barcode")}
        >
          Código
        </button>
        <button
          type="button"
          className={mode === "cover" ? "active" : ""}
          onClick={() => void switchMode("cover")}
        >
          Capa
        </button>
      </div>

      <p className="ms-msg">{message}</p>

      <div className={`ms-stage ${mode}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Prévia" className="ms-video" />
        ) : (
          <>
            <video
              ref={videoRef}
              className="ms-video"
              playsInline
              muted
              autoPlay
            />
            {mode === "barcode" ? (
              <div className="ms-guide barcode">
                <div className="ms-scan-line" />
              </div>
            ) : (
              <div className="ms-guide cover" />
            )}
          </>
        )}
      </div>

      {mode === "cover" ? (
        <div className="ms-actions">
          {preview ? (
            <>
              <button type="button" className="ms-btn ghost" onClick={retake}>
                Tirar outra
              </button>
              <button
                type="button"
                className="ms-btn primary"
                disabled={sending}
                onClick={() =>
                  preview && void sendResult({ type: "photo", imageBase64: preview })
                }
              >
                {sending ? "Enviando…" : "Enviar ao PC"}
              </button>
            </>
          ) : (
            <button type="button" className="ms-btn primary" onClick={shoot}>
              Fotografar
            </button>
          )}
        </div>
      ) : (
        <p className="ms-hint">Leitura automática — mantenha o código na mira.</p>
      )}
    </main>
  );
}
