"use client";

import { useEffect, useState } from "react";

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function detect() {
  if (typeof window === "undefined") {
    return { isIos: false, isStandalone: false, isAndroid: false };
  }
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return { isIos, isStandalone, isAndroid };
}

export function MobileAppInstallGuide() {
  const [env, setEnv] = useState(detect);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnv(detect());
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="rounded-lg border border-line bg-card p-5 text-sm text-muted">
        Preparando guia do app…
      </div>
    );
  }

  if (env.isStandalone) {
    return (
      <div
        id="app-celular"
        className="rounded-lg border border-line bg-accent-soft p-5"
      >
        <p className="text-sm font-semibold text-accent-text">
          App instalado neste aparelho
        </p>
        <p className="mt-1 text-sm text-muted">
          Você abriu pelo ícone da tela inicial. Role até{" "}
          <strong>Notificações no celular</strong> e toque em Ativar.
        </p>
      </div>
    );
  }

  return (
    <div
      id="app-celular"
      className="overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow)]"
    >
      <div className="border-b border-line bg-accent-soft px-5 py-4">
        <h3 className="text-base font-semibold text-ink">
          App no celular (iPhone)
        </h3>
        <p className="mt-1 text-sm text-muted">
          No iPhone as notificações de reserva só funcionam se o GuerraAcervo
          estiver na <strong>Tela de Início</strong>, como um app. Siga os
          passos no Safari.
        </p>
      </div>

      <ol className="divide-y divide-line">
        <li className="flex gap-4 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            1
          </span>
          <div>
            <p className="font-medium text-ink">Abra este painel no Safari</p>
            <p className="mt-1 text-sm text-muted">
              Não use Instagram, WhatsApp ou Chrome embutido. Copie o link e
              cole no <strong>Safari</strong> (ícone azul da maçã).
            </p>
          </div>
        </li>

        <li className="flex gap-4 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            2
          </span>
          <div>
            <p className="font-medium text-ink">Toque em Compartilhar</p>
            <p className="mt-1 text-sm text-muted">
              Na barra de baixo do Safari, toque no ícone{" "}
              <span className="inline-flex items-center gap-1 rounded border border-line bg-background px-1.5 py-0.5 align-middle text-accent-text">
                <ShareIcon className="inline" /> Compartilhar
              </span>{" "}
              (quadrado com seta para cima).
            </p>
          </div>
        </li>

        <li className="flex gap-4 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            3
          </span>
          <div>
            <p className="font-medium text-ink">
              Adicionar à Tela de Início
            </p>
            <p className="mt-1 text-sm text-muted">
              Role a lista e toque em{" "}
              <strong>&quot;Adicionar à Tela de Início&quot;</strong> →
              Adicionar. Vai aparecer o ícone <strong>GuerraAcervo</strong>.
            </p>
          </div>
        </li>

        <li className="flex gap-4 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            4
          </span>
          <div>
            <p className="font-medium text-ink">Abra pelo ícone novo</p>
            <p className="mt-1 text-sm text-muted">
              Saia do Safari. Na tela inicial, toque no ícone GuerraAcervo
              (abre em tela cheia, sem barra do Safari). Entre com seu login se
              pedir.
            </p>
          </div>
        </li>

        <li className="flex gap-4 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            5
          </span>
          <div>
            <p className="font-medium text-ink">Ative as notificações</p>
            <p className="mt-1 text-sm text-muted">
              No app, vá em <strong>Loja</strong> (menu de baixo) → toque em{" "}
              <strong>Ativar alertas neste aparelho</strong> → Permitir.
            </p>
          </div>
        </li>
      </ol>

      {env.isAndroid ? (
        <div className="border-t border-line px-5 py-4 text-sm text-muted">
          <strong className="text-ink">Android:</strong> no Chrome, menu ⋮ →
          &quot;Adicionar à tela inicial&quot; ou &quot;Instalar app&quot;, depois
          ative as notificações abaixo.
        </div>
      ) : null}

      {!env.isIos && !env.isAndroid ? (
        <div className="border-t border-line px-5 py-4 text-sm text-muted">
          Este guia é para iPhone. No computador o banner de reserva e o
          WhatsApp já avisam; o push é pensado para o celular da prateleira.
        </div>
      ) : null}

      {env.isIos ? (
        <div className="border-t border-line bg-background px-5 py-3 text-xs text-muted">
          Dica iPhone 13: se não achar &quot;Adicionar à Tela de Início&quot;,
          no menu Compartilhar role até o fim → &quot;Editar Ações…&quot; e
          ative essa opção.
        </div>
      ) : null}
    </div>
  );
}
