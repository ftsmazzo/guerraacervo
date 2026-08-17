"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CaptureMode = "barcode" | "cover";

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

async function loadZXing(): Promise<void> {
  if (window.ZXing) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-zxing="1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Falha ao carregar ZXing")),
      );
      if (window.ZXing) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js";
    s.dataset.zxing = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar ZXing"));
    document.body.appendChild(s);
  });
}

function preferBackCamera(devices: MediaDeviceInfo[]): string | null {
  return (
    devices.find((d) => /back|rear|traseira|environment/i.test(d.label))
      ?.deviceId ||
    devices[0]?.deviceId ||
    null
  );
}

/** Captura frame do vídeo e comprime para JPEG data-URL */
function captureFrameFromVideo(
  video: HTMLVideoElement,
  maxSide = 640,
): string {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível capturar o frame");
  ctx.drawImage(video, 0, 0, w, h);
  let quality = 0.72;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > 700_000 && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > 900_000) {
    throw new Error("Foto muito grande; enquadre de novo mais perto.");
  }
  return out;
}

type Props = {
  open: boolean;
  initialMode?: CaptureMode;
  onClose: () => void;
  onIsbn: (code: string) => void;
  onCoverPhoto: (dataUrl: string) => void;
};

export function BookCapture({
  open,
  initialMode = "barcode",
  onClose,
  onIsbn,
  onCoverPhoto,
}: Props) {
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Aponte o código de barras");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<ZXingReader | null>(null);
  const scannedRef = useRef(false);
  const galleryRef = useRef<HTMLInputElement>(null);

  const stopAll = useCallback(() => {
    try {
      readerRef.current?.reset();
    } catch {
      /* ignore */
    }
    readerRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.srcObject = null;
    }
  }, []);

  const startCoverCamera = useCallback(
    async (deviceId: string | null) => {
      stopAll();
      setError(null);
      setPreview(null);
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: "environment" } },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setHint("Enquadre a capa inteira e toque em Fotografar");
    },
    [stopAll],
  );

  const startBarcode = useCallback(
    async (deviceId: string | null) => {
      stopAll();
      setError(null);
      setPreview(null);
      scannedRef.current = false;
      await loadZXing();
      const reader = new window.ZXing!.BrowserMultiFormatReader();
      readerRef.current = reader;
      const devices = await reader.listVideoInputDevices();
      setCameras(devices);
      const preferred = deviceId || preferBackCamera(devices);
      if (preferred) setCameraId(preferred);
      setHint("Aponte o código de barras do livro");
      const video = videoRef.current;
      if (!video) return;
      await reader.decodeFromVideoDevice(preferred, video, (result) => {
        if (!result || scannedRef.current) return;
        scannedRef.current = true;
        const code = result.getText();
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(40);
          }
        } catch {
          /* ignore */
        }
        stopAll();
        onIsbn(code);
        onClose();
      });
    },
    [onClose, onIsbn, stopAll],
  );

  useEffect(() => {
    if (!open) {
      stopAll();
      setPreview(null);
      setError(null);
      return;
    }
    setMode(initialMode);
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        if (initialMode === "barcode") {
          await startBarcode(null);
        } else {
          // Listar câmeras via getUserMedia + enumerate
          const tmp = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
          tmp.getTracks().forEach((t) => t.stop());
          const devices = (
            await navigator.mediaDevices.enumerateDevices()
          ).filter((d) => d.kind === "videoinput");
          if (cancelled) return;
          setCameras(devices);
          const preferred = preferBackCamera(devices);
          if (preferred) setCameraId(preferred);
          await startCoverCamera(preferred);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível abrir a câmera. Verifique a permissão.",
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/initialMode only
  }, [open, initialMode]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("ga-capture-open");
    return () => document.body.classList.remove("ga-capture-open");
  }, [open]);

  async function switchMode(next: CaptureMode) {
    if (next === mode && !preview) return;
    setMode(next);
    setPreview(null);
    setBusy(true);
    setError(null);
    try {
      if (next === "barcode") {
        await startBarcode(cameraId || null);
      } else {
        await startCoverCamera(cameraId || null);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao trocar modo da câmera",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCameraChange(id: string) {
    setCameraId(id);
    setBusy(true);
    try {
      if (mode === "barcode") await startBarcode(id);
      else await startCoverCamera(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao trocar câmera");
    } finally {
      setBusy(false);
    }
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    try {
      const dataUrl = captureFrameFromVideo(video);
      setPreview(dataUrl);
      setHint("Confira a foto. Use esta ou tire outra.");
      // pausa tracks visuais mas mantém stream? better stop display freeze via pause
      video.pause();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao fotografar");
    }
  }

  function retake() {
    setPreview(null);
    const video = videoRef.current;
    if (video?.srcObject) {
      void video.play();
      setHint("Enquadre a capa inteira e toque em Fotografar");
    } else {
      void startCoverCamera(cameraId || null);
    }
  }

  function confirmPhoto() {
    if (!preview) return;
    const data = preview;
    stopAll();
    onCoverPhoto(data);
    onClose();
  }

  async function onGalleryFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Falha ao ler imagem"));
        reader.readAsDataURL(file);
      });
      // Reusa canvas compress via Image
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Imagem inválida"));
        el.src = raw;
      });
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.72;
      let out = canvas.toDataURL("image/jpeg", quality);
      while (out.length > 700_000 && quality > 0.4) {
        quality -= 0.1;
        out = canvas.toDataURL("image/jpeg", quality);
      }
      setPreview(out);
      setMode("cover");
      setHint("Confira a foto. Use esta ou escolha outra.");
      stopAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir imagem");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="book-capture-modal" role="dialog" aria-modal="true">
      <div className="book-capture-sheet">
        <header className="book-capture-header">
          <div>
            <strong>Câmera</strong>
            <p className="book-capture-hint">{hint}</p>
          </div>
          <button
            type="button"
            className="book-capture-close"
            onClick={() => {
              stopAll();
              onClose();
            }}
          >
            Fechar
          </button>
        </header>

        <div className="book-capture-modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "barcode"}
            className={
              mode === "barcode"
                ? "book-capture-mode active"
                : "book-capture-mode"
            }
            onClick={() => void switchMode("barcode")}
            disabled={busy}
          >
            Código de barras
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "cover"}
            className={
              mode === "cover"
                ? "book-capture-mode active"
                : "book-capture-mode"
            }
            onClick={() => void switchMode("cover")}
            disabled={busy}
          >
            Foto da capa
          </button>
        </div>

        {error ? (
          <div className="book-capture-error">{error}</div>
        ) : null}

        <div
          className={
            mode === "barcode"
              ? "book-capture-stage barcode"
              : "book-capture-stage cover"
          }
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prévia da capa" className="book-capture-preview" />
          ) : (
            <>
              <video
                ref={videoRef}
                className="book-capture-video"
                playsInline
                muted
                autoPlay
              />
              {mode === "barcode" ? (
                <div className="book-capture-barcode-guide" aria-hidden>
                  <div className="book-capture-scan-line" />
                </div>
              ) : (
                <div className="book-capture-cover-guide" aria-hidden />
              )}
            </>
          )}
        </div>

        {cameras.length > 1 && !preview ? (
          <select
            className="form-select book-capture-camera"
            value={cameraId}
            onChange={(e) => void onCameraChange(e.target.value)}
          >
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || "Câmera"}
              </option>
            ))}
          </select>
        ) : null}

        <footer className="book-capture-footer">
          {mode === "cover" ? (
            preview ? (
              <>
                <button
                  type="button"
                  className="rounded-md border border-line px-4 py-3 text-sm"
                  onClick={retake}
                >
                  Tirar outra
                </button>
                <button
                  type="button"
                  className="btn-accent book-capture-shutter"
                  onClick={confirmPhoto}
                >
                  Usar esta
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded-md border border-line px-3 py-3 text-sm"
                  onClick={() => galleryRef.current?.click()}
                >
                  Galeria
                </button>
                <button
                  type="button"
                  className="btn-accent book-capture-shutter"
                  onClick={takePhoto}
                  disabled={busy || Boolean(error)}
                >
                  Fotografar
                </button>
              </>
            )
          ) : (
            <p className="book-capture-footer-note">
              A leitura é automática — mantenha o código na mira.
            </p>
          )}
        </footer>

        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="book-capture-file-input"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onGalleryFile(f);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
