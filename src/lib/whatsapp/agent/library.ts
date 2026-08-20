import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { renewLoanInternal } from "@/lib/library/actions";
import { listLoansForClient, listPublicCatalog } from "@/lib/library/queries";
import { sendTextMessage, type EvolutionConfig } from "@/lib/whatsapp/evolution";

function isRenew(text: string) {
  return /^renovar(\s+todos)?\b/i.test(text.trim());
}

function isGreeting(text: string) {
  const t = text.trim();
  return /^(menu|ajuda|help|oi|ol[aá]|ola|bom dia|boa tarde|boa noite)[.!?]*$/i.test(
    t,
  );
}

function looksLikeAvailability(text: string) {
  return /\b(dispon[ií]vel|tem o livro|tem livro|cat[aá]logo|acervo)\b/i.test(
    text,
  );
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

async function libraryName(tenantId: string) {
  const [row] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row?.name || "a biblioteca";
}

export async function handleLibraryInbound(opts: {
  cfg: EvolutionConfig;
  tenantId: string;
  instanceName: string;
  phone: string;
  text: string;
  clientId?: string;
  readerName?: string;
}) {
  const name = await libraryName(opts.tenantId);

  if (!opts.clientId) {
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Olá! Este WhatsApp é da ${name}. Empréstimo e cadastro são no balcão. Se você já é leitor, use o mesmo número cadastrado.\n\nPara saber se um título está disponível, escreva o nome do livro.`,
    );
    return;
  }

  const open = await listLoansForClient(opts.tenantId, opts.clientId, {
    openOnly: true,
  });
  const text = opts.text.trim();

  if (isRenew(text)) {
    if (!open.length) {
      await sendTextMessage(
        opts.cfg,
        opts.instanceName,
        opts.phone,
        "Você não tem empréstimo aberto para renovar.",
      );
      return;
    }
    const all = /todos/i.test(text);
    const targets = all ? open : [open[0]];
    const lines: string[] = [];
    for (const loan of targets) {
      const res = await renewLoanInternal(opts.tenantId, loan.id);
      if (res.ok) {
        const due = res.dueAt
          ? fmtDate(new Date(res.dueAt))
          : fmtDate(loan.dueAt);
        lines.push(`• ${loan.title} — novo prazo ${due}`);
      } else {
        lines.push(`• ${loan.title} — ${res.error}`);
      }
    }
    if (!all && open.length > 1) {
      lines.push(
        `\nHá ${open.length} empréstimos abertos. Para renovar todos, responda *renovar todos*.`,
      );
    }
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Renovação:\n${lines.join("\n")}`,
    );
    return;
  }

  if (looksLikeAvailability(text) || text.length >= 4) {
    const q = text
      .replace(/^(tem|voc[eê]s t[eê]m|dispon[ií]vel|cat[aá]logo|acervo)\s+/i, "")
      .trim();
    if (q.length >= 3 && !isGreeting(text)) {
      const hits = await listPublicCatalog({
        tenantId: opts.tenantId,
        busca: q,
        limit: 5,
      });
      if (hits.length) {
        const lines = hits.map((h) => {
          const avail = Number(h.available) > 0 ? "disponível agora" : "emprestado";
          return `• ${h.title}${h.author ? ` — ${h.author}` : ""} (${avail})`;
        });
        await sendTextMessage(
          opts.cfg,
          opts.instanceName,
          opts.phone,
          `No acervo:\n${lines.join("\n")}\n\nPara renovar um empréstimo, responda *renovar*.`,
        );
        return;
      }
    }
  }

  if (isGreeting(text) || open.length) {
    if (!open.length) {
      await sendTextMessage(
        opts.cfg,
        opts.instanceName,
        opts.phone,
        `Olá${opts.readerName ? `, ${opts.readerName}` : ""}! Você não tem empréstimo aberto. Escreva o título para ver se está disponível, ou responda *renovar* quando tiver um prazo para estender.`,
      );
      return;
    }
    const lines = open.map((l) => {
      const late = l.status === "overdue" ? " — atrasado" : "";
      return `• ${l.title} · vence ${fmtDate(l.dueAt)}${late}`;
    });
    await sendTextMessage(
      opts.cfg,
      opts.instanceName,
      opts.phone,
      `Seus empréstimos:\n${lines.join("\n")}\n\nResponda *renovar* para estender o prazo (o mais próximo vence primeiro). *renovar todos* cobre todos.`,
    );
    return;
  }

  await sendTextMessage(
    opts.cfg,
    opts.instanceName,
    opts.phone,
    "Posso *renovar* um empréstimo ou dizer se um título está disponível. Para outros assuntos, fale com o responsável da biblioteca.",
  );
}
