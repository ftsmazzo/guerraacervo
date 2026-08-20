"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createBooksBatch,
  type BatchBookSaveItem,
} from "@/lib/books/actions";

type DraftBook = {
  key: string;
  include: boolean;
  titulo: string;
  autor: string;
  editora: string;
  ano: string;
  isbn: string;
  sinopse: string;
  paginas: string;
  capaUrl: string;
  genero: string;
  idioma: string;
  peso: string;
  estado: "Novo" | "Ótimo" | "Bom" | "Regular";
  tipoCapa: "Brochura" | "Capa Dura";
  precoVenda: string;
  tags: string;
  confianca: number | null;
  avisos: string[];
};

async function fileToDataUrl(file: File, maxSide = 1280): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagem inválida"));
    el.src = raw;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (raw.length > 1_200_000) {
      throw new Error("Foto muito grande. Tire de novo um pouco mais longe.");
    }
    return raw;
  }
  ctx.drawImage(img, 0, 0, w, h);
  let quality = 0.78;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > 1_400_000 && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > 1_800_000) {
    throw new Error("Foto ainda grande demais após compressão.");
  }
  return out;
}

function mapApiToDraft(b: Record<string, unknown>, i: number): DraftBook {
  const tags = Array.isArray(b.tags) ? b.tags.map(String) : [];
  return {
    key: `d-${i}-${String(b.titulo || i).slice(0, 12)}`,
    include: true,
    titulo: String(b.titulo || ""),
    autor: String(b.autor || ""),
    editora: String(b.editora || ""),
    ano: String(b.ano || ""),
    isbn: String(b.isbn || ""),
    sinopse: String(b.sinopse || ""),
    paginas: b.paginas != null ? String(b.paginas) : "",
    capaUrl: String(b.capa || ""),
    genero: String(b.genero || ""),
    idioma: String(b.idioma || "Português"),
    peso: b.peso != null ? String(b.peso) : "300",
    estado: "Bom",
    tipoCapa:
      b.tipoCapa === "Capa Dura" || b.tipoCapa === "Brochura"
        ? b.tipoCapa
        : "Brochura",
    precoVenda: "",
    tags: tags.join(", "),
    confianca: typeof b.confianca === "number" ? b.confianca : null,
    avisos: Array.isArray(b.avisos) ? b.avisos.map(String) : [],
  };
}

export function BatchPhotoForm({ library = false }: { library?: boolean }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftBook[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startSave] = useTransition();

  function updateDraft(key: string, patch: Partial<DraftBook>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setError(null);
    setInfo(null);
    setDrafts([]);
    try {
      setAnalyzing(true);
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      const res = await fetch("/api/isbn/batch-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const data = (await res.json()) as {
        error?: string;
        detail?: string;
        books?: Record<string, unknown>[];
        count?: number;
        model?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || data.detail || `Erro ${res.status}`);
      }
      const books = (data.books || []).map(mapApiToDraft);
      setDrafts(books);
      setInfo(
        `${books.length} livro(s) detectado(s)${data.model ? ` · ${data.model}` : ""}. Confira e informe o preço de venda.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    } finally {
      setAnalyzing(false);
    }
  }

  function saveSelected() {
    setError(null);
    const selected = drafts.filter((d) => d.include && d.titulo.trim());
    if (!selected.length) {
      setError("Marque pelo menos um livro com título.");
      return;
    }
    for (const d of selected) {
      if (!library) {
        const price = Number(d.precoVenda.replace(",", "."));
        if (!Number.isFinite(price) || price <= 0) {
          setError(`Informe o preço de venda de “${d.titulo}”.`);
          return;
        }
      }
      const peso = Number(d.peso || 300);
      if (!Number.isFinite(peso) || peso <= 0) {
        setError(`Informe o peso (g) de “${d.titulo}”.`);
        return;
      }
    }

    const payload: BatchBookSaveItem[] = selected.map((d) => ({
      titulo: d.titulo.trim(),
      autor: d.autor.trim() || null,
      editora: d.editora.trim() || null,
      ano: d.ano.trim() ? Number(d.ano) : null,
      isbn: d.isbn.trim() || null,
      sinopse: d.sinopse.trim() || null,
      paginas: d.paginas.trim() ? Number(d.paginas) : null,
      capaUrl: d.capaUrl.trim() || null,
      genero: d.genero.trim() || null,
      idioma: d.idioma.trim() || "Português",
      peso: Number(d.peso || 300),
      estado: d.estado,
      tipoCapa: d.tipoCapa,
      precoVenda: library ? 0 : Number(d.precoVenda.replace(",", ".")),
      estoque: 1,
      tags: d.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    }));

    startSave(async () => {
      const res = await createBooksBatch(payload);
      if (!res.saved.length) {
        setError(
          res.errors[0]?.error || "Nenhum livro foi salvo. Revise os dados.",
        );
        return;
      }
      const msg =
        `Salvos: ${res.saved.length}` +
        (res.errors.length ? ` · falhas: ${res.errors.length}` : "");
      if (res.errors.length) {
        setInfo(msg);
        setError(res.errors.map((e) => `${e.titulo}: ${e.error}`).join(" · "));
        setDrafts((prev) =>
          prev.filter(
            (d) =>
              !res.saved.some(
                (s) => s.titulo === d.titulo && d.include,
              ),
          ),
        );
        return;
      }
      router.push("/painel/livros");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body" style={{ padding: "1rem" }}>
          <p className="text-sm text-muted" style={{ marginBottom: "0.75rem" }}>
            Enquadre 3–8 livros com capa ou lombada legível. Depois revise
            título/preço antes de gravar.
          </p>
          <label className="btn-accent" style={{ display: "inline-block", cursor: "pointer" }}>
            {analyzing ? "Analisando…" : "Escolher / tirar foto"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={analyzing || pending}
              style={{ display: "none" }}
              onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            />
          </label>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Foto enviada"
              style={{
                display: "block",
                marginTop: "0.75rem",
                maxHeight: 220,
                borderRadius: 8,
                border: "1px solid var(--line, #e5e5e5)",
              }}
            />
          ) : null}
          {analyzing ? (
            <p className="mt-3 text-sm text-muted">
              Identificando livros e enriquecendo fichas… pode levar cerca de 1
              minuto.
            </p>
          ) : null}
          {info ? (
            <p className="mt-3 text-sm" style={{ color: "var(--accent-text, #c45c00)" }}>
              {info}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm" style={{ color: "#b91c1c" }} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {drafts.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {drafts.filter((d) => d.include).length} selecionado(s) de{" "}
              {drafts.length}
            </p>
            <button
              type="button"
              className="btn-accent"
              disabled={pending || analyzing}
              onClick={saveSelected}
            >
              {pending ? "Salvando…" : "Salvar selecionados"}
            </button>
          </div>

          <div className="space-y-3">
            {drafts.map((d, idx) => (
              <div
                key={d.key}
                className="card"
                style={{
                  opacity: d.include ? 1 : 0.55,
                  borderColor: d.include ? undefined : "#ddd",
                }}
              >
                <div className="card-body" style={{ padding: "0.85rem 1rem" }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={d.include}
                        onChange={(e) =>
                          updateDraft(d.key, { include: e.target.checked })
                        }
                      />
                      #{idx + 1}
                      {d.confianca != null
                        ? ` · confiança ${Math.round(d.confianca * 100)}%`
                        : ""}
                    </label>
                    {d.capaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.capaUrl}
                        alt=""
                        style={{
                          width: 48,
                          height: 72,
                          objectFit: "cover",
                          borderRadius: 4,
                        }}
                      />
                    ) : null}
                  </div>

                  <div
                    className="mt-3 grid gap-2"
                    style={{
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    }}
                  >
                    <label className="text-xs text-muted block sm:col-span-2">
                      Título
                      <input
                        className="form-control mt-1"
                        value={d.titulo}
                        onChange={(e) =>
                          updateDraft(d.key, { titulo: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-muted block">
                      Autor
                      <input
                        className="form-control mt-1"
                        value={d.autor}
                        onChange={(e) =>
                          updateDraft(d.key, { autor: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-muted block">
                      Editora
                      <input
                        className="form-control mt-1"
                        value={d.editora}
                        onChange={(e) =>
                          updateDraft(d.key, { editora: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-muted block">
                      ISBN
                      <input
                        className="form-control mt-1"
                        value={d.isbn}
                        onChange={(e) =>
                          updateDraft(d.key, { isbn: e.target.value })
                        }
                      />
                    </label>
                    {library ? null : (
                    <label className="text-xs text-muted block">
                      Preço venda (R$) *
                      <input
                        className="form-control mt-1"
                        inputMode="decimal"
                        placeholder="ex. 25"
                        value={d.precoVenda}
                        onChange={(e) =>
                          updateDraft(d.key, { precoVenda: e.target.value })
                        }
                      />
                    </label>
                    )}
                    <label className="text-xs text-muted block">
                      Estado
                      <select
                        className="form-select mt-1"
                        value={d.estado}
                        onChange={(e) =>
                          updateDraft(d.key, {
                            estado: e.target.value as DraftBook["estado"],
                          })
                        }
                      >
                        <option value="Novo">Novo</option>
                        <option value="Ótimo">Ótimo</option>
                        <option value="Bom">Bom</option>
                        <option value="Regular">Regular</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted block">
                      Peso (g)
                      <input
                        className="form-control mt-1"
                        inputMode="numeric"
                        value={d.peso}
                        onChange={(e) =>
                          updateDraft(d.key, { peso: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-muted block">
                      Ano
                      <input
                        className="form-control mt-1"
                        value={d.ano}
                        onChange={(e) =>
                          updateDraft(d.key, { ano: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-muted block sm:col-span-2">
                      Tags
                      <input
                        className="form-control mt-1"
                        value={d.tags}
                        onChange={(e) =>
                          updateDraft(d.key, { tags: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs text-muted block sm:col-span-2">
                      Sinopse
                      <textarea
                        className="form-control mt-1"
                        rows={2}
                        value={d.sinopse}
                        onChange={(e) =>
                          updateDraft(d.key, { sinopse: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-accent"
              disabled={pending || analyzing}
              onClick={saveSelected}
            >
              {pending ? "Salvando…" : "Salvar selecionados"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
