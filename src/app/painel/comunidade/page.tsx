import Link from "next/link";
import { ReadingCover } from "@/components/reading/reading-cover";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { CommentForm } from "@/components/reading/reading-ui";
import {
  listCommentsForPosts,
  listReadingPosts,
  weeklyFinishedTitles,
} from "@/lib/reading/queries";

function formatWhen(d: Date | string) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const dynamic = "force-dynamic";

export default async function ComunidadePage() {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) redirect("/login?next=/painel/comunidade");
  if (ctx.tenant.product !== "personal") redirect("/painel");

  const posts = await listReadingPosts(40);
  const comments = await listCommentsForPosts(posts.map((p) => p.id));
  const week = await weeklyFinishedTitles(6);
  const byPost = new Map<string, typeof comments>();
  for (const c of comments) {
    const list = byPost.get(c.postId) || [];
    list.push(c);
    byPost.set(c.postId, list);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Comunidade</h1>
      <p className="mt-1 text-sm text-muted">
        Resenhas de quem lê no PrismaBook. Sem likes — só o que as pessoas
        escreveram.
      </p>

      {week.length ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink">Mais lidos na semana</h2>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
            {week.map((w) => (
              <div
                key={`${w.title}-${w.author}`}
                className="w-[92px] shrink-0 text-center"
              >
                <div className="flex justify-center">
                  <ReadingCover
                    coverUrl={w.coverUrl}
                    percent={100}
                    size="sm"
                  />
                </div>
                <p className="mt-1 line-clamp-2 text-[0.7rem] font-medium text-ink">
                  {w.title}
                </p>
                <p className="text-[0.65rem] text-muted">{w.n} resenha(s)</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 space-y-4">
        {!posts.length ? (
          <div className="rounded-lg border border-line bg-card p-6 text-sm text-muted">
            Ainda não tem resenha no mural. Ao concluir um livro na{" "}
            <Link href="/painel/livros" className="text-accent-text underline">
              estante
            </Link>
            , você pode postar.
          </div>
        ) : (
          posts.map((p) => {
            const thread = byPost.get(p.id) || [];
            return (
              <article
                key={p.id}
                className="rounded-lg border border-line bg-card p-4 shadow-[var(--shadow)]"
              >
                <div className="flex gap-3">
                  <ReadingCover
                    coverUrl={p.coverUrl}
                    percent={100}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-muted">
                      {p.displayName} · {formatWhen(p.createdAt)}
                    </p>
                    <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                    <p className="text-xs text-muted">{p.author || "—"}</p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{p.body}</p>
                {thread.length ? (
                  <ul className="mt-3 space-y-2 border-t border-line pt-3">
                    {thread.map((c) => (
                      <li key={c.id} className="text-sm">
                        <span className="font-medium text-ink">{c.displayName}</span>
                        <span className="text-muted"> · {formatWhen(c.createdAt)}</span>
                        <p className="text-ink">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <CommentForm postId={p.id} />
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
