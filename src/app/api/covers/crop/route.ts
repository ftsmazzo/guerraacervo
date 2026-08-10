import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import {
  clampBBox,
  COVER_CROP_SCHEMA,
  fallbackBookBBox,
} from "@/lib/isbn/cover-crop";
import {
  openRouterChat,
  OpenRouterError,
  resolveOpenRouterConfig,
} from "@/lib/isbn/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  imageBase64: z.string().min(20).max(1_200_000),
});

function parseBBox(content: string) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const cfg = resolveOpenRouterConfig();
  if (!cfg.apiKey) {
    return NextResponse.json(
      { bbox: fallbackBookBBox(), source: "fallback", error: "Sem API key" },
      { status: 200 },
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
    return NextResponse.json({ error: "Informe imageBase64." }, { status: 400 });
  }

  const imageUrl = parsed.data.imageBase64.startsWith("data:")
    ? parsed.data.imageBase64
    : `data:image/jpeg;base64,${parsed.data.imageBase64}`;

  try {
    const { content } = await openRouterChat({
      apiKey: cfg.apiKey,
      appUrl: cfg.appUrl,
      model: cfg.model,
      fallbacks: cfg.fallbacks,
      webSearch: false,
      temperature: 0,
      jsonSchema: COVER_CROP_SCHEMA,
      messages: [
        {
          role: "system",
          content: `Você localiza a capa do livro na foto.
Devolva um bounding box em frações 0–1 (x,y,width,height) que contenha SÓ a capa retangular do livro.
Ignore mesa, fundo, mãos, sombra e margens vazias.
Ajuste o box o mais apertado possível na capa.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Marque a região da capa do livro nesta foto.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    });

    const raw = parseBBox(content);
    const bbox = raw
      ? clampBBox({
          x: Number(raw.x),
          y: Number(raw.y),
          width: Number(raw.width),
          height: Number(raw.height),
        })
      : null;

    if (!bbox || (typeof raw?.confianca === "number" && raw.confianca < 0.35)) {
      return NextResponse.json({
        bbox: fallbackBookBBox(),
        source: "fallback",
      });
    }

    return NextResponse.json({
      bbox,
      source: "vision",
      confianca: Number(raw?.confianca) || null,
    });
  } catch (e) {
    if (e instanceof OpenRouterError) {
      return NextResponse.json({
        bbox: fallbackBookBBox(),
        source: "fallback",
        detail: e.detail,
      });
    }
    return NextResponse.json({
      bbox: fallbackBookBBox(),
      source: "fallback",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
