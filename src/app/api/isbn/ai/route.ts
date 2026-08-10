import { NextResponse } from "next/server";
import { z } from "zod";
import {
  emptyLookup,
  type BookLookupResult,
} from "@/lib/isbn/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.union([
  z.object({ query: z.string().min(3) }),
  z.object({ imageBase64: z.string().min(20) }),
]);

function parseAiJson(content: string): Partial<BookLookupResult> {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Partial<BookLookupResult>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Partial<BookLookupResult>;
      } catch {
        return {};
      }
    }
    return {};
  }
}

function toResult(
  partial: Partial<BookLookupResult>,
  src: string,
): BookLookupResult {
  const base = emptyLookup(src);
  const tipo =
    partial.tipoCapa === "Brochura" || partial.tipoCapa === "Capa Dura"
      ? partial.tipoCapa
      : null;
  return {
    ...base,
    titulo: String(partial.titulo || ""),
    paginas:
      typeof partial.paginas === "number" && partial.paginas > 0
        ? partial.paginas
        : null,
    autor: String(partial.autor || ""),
    editora: String(partial.editora || ""),
    ano: String(partial.ano || "").match(/\d{4}/)?.[0] || "",
    sinopse: String(partial.sinopse || ""),
    capa: String(partial.capa || ""),
    genero: String(partial.genero || ""),
    idioma: String(partial.idioma || ""),
    tipoCapa: tipo,
    peso:
      typeof partial.peso === "number" && partial.peso > 0
        ? partial.peso
        : null,
    tags: Array.isArray(partial.tags)
      ? partial.tags.map(String).filter(Boolean).slice(0, 12)
      : [],
  };
}

const FIELD_SPEC = `Responda APENAS com JSON válido (sem markdown) no formato:
{
  "titulo": string,
  "autor": string,
  "editora": string,
  "ano": string (AAAA),
  "sinopse": string,
  "capa": string (URL se souber, senão ""),
  "genero": string,
  "idioma": string (ex: Português),
  "paginas": number|null,
  "tipoCapa": "Brochura"|"Capa Dura"|null,
  "peso": number|null (gramas),
  "tags": string[] (em português, curtas)
}`;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe { query } ou { imageBase64 }." },
      { status: 400 },
    );
  }

  const dataIn = parsed.data;
  const isImage = "imageBase64" in dataIn;
  const system = isImage
    ? `Você identifica livros a partir da foto da capa. Extraia metadados bibliográficos. ${FIELD_SPEC}`
    : `Você preenche metadados de livros a partir de uma descrição ou busca textual. ${FIELD_SPEC}`;

  const userContent = isImage
    ? [
        {
          type: "text" as const,
          text: "Identifique o livro nesta capa e preencha os campos.",
        },
        {
          type: "image_url" as const,
          image_url: {
            url: dataIn.imageBase64.startsWith("data:")
              ? dataIn.imageBase64
              : `data:image/jpeg;base64,${dataIn.imageBase64}`,
          },
        },
      ]
    : `Descrição / busca do livro:\n${dataIn.query}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return NextResponse.json(
        { error: "Falha na API OpenAI.", detail: errText.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "";
    const partial = parseAiJson(content);
    const result = toResult(
      partial,
      isImage ? "IA (capa)" : "IA (texto)",
    );

    if (!result.titulo) {
      return NextResponse.json(
        { error: "Não foi possível identificar o livro.", ...result },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error: "Erro ao consultar OpenAI.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
