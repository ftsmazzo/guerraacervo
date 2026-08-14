"use client";

import { useEffect, useState, type ReactNode } from "react";

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

function MenuDotsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

type PlatformTab = "ios" | "android";

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

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
        {n}
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

function IosSteps() {
  return (
    <>
      <ol className="divide-y divide-line">
        <Step n={1} title="Abra este painel no Safari">
          Não use Instagram, WhatsApp ou Chrome embutido. Copie o link e cole
          no <strong>Safari</strong>.
        </Step>
        <Step n={2} title="Toque em Compartilhar">
          Na barra de baixo do Safari, toque em{" "}
          <span className="inline-flex items-center gap-1 rounded border border-line bg-background px-1.5 py-0.5 align-middle text-accent-text">
            <ShareIcon className="inline" /> Compartilhar
          </span>{" "}
          (quadrado com seta para cima).
        </Step>
        <Step n={3} title="Adicionar à Tela de Início">
          Role a lista → <strong>&quot;Adicionar à Tela de Início&quot;</strong>{" "}
          → Adicionar. Aparece o ícone <strong>PrismaBook</strong>.
        </Step>
        <Step n={4} title="Abra pelo ícone novo">
          Saia do Safari e abra pelo ícone (tela cheia, sem barra do Safari).
          Faça login se pedir.
        </Step>
        <Step n={5} title="Ative as notificações">
          Em <strong>Loja</strong> →{" "}
          <strong>Ativar alertas neste aparelho</strong> → Permitir.
        </Step>
      </ol>
      <div className="border-t border-line bg-background px-5 py-3 text-xs text-muted">
        Dica: se não achar a opção, em Compartilhar role até o fim →{" "}
        &quot;Editar Ações…&quot; e ative &quot;Adicionar à Tela de Início&quot;.
      </div>
    </>
  );
}

function AndroidSteps() {
  return (
    <>
      <ol className="divide-y divide-line">
        <Step n={1} title="Abra no Chrome (ou Edge)">
          Use o navegador completo — não o navegador interno do WhatsApp /
          Instagram. Cole o link do painel no <strong>Chrome</strong>.
        </Step>
        <Step n={2} title="Menu do navegador">
          Toque nos três pontinhos{" "}
          <span className="inline-flex items-center gap-1 rounded border border-line bg-background px-1.5 py-0.5 align-middle text-accent-text">
            <MenuDotsIcon className="inline" /> ⋮
          </span>{" "}
          no canto superior direito.
        </Step>
        <Step n={3} title="Instalar ou adicionar à tela inicial">
          Toque em <strong>&quot;Instalar app&quot;</strong> ou{" "}
          <strong>&quot;Adicionar à tela inicial&quot;</strong> /{" "}
          <strong>&quot;Instalar página como app&quot;</strong> (o texto muda
          conforme a versão do Chrome) → Confirmar.
        </Step>
        <Step n={4} title="Abra pelo ícone PrismaBook">
          Na tela inicial ou na gaveta de apps, abra o ícone. Deve abrir sem a
          barra de endereço do Chrome.
        </Step>
        <Step n={5} title="Ative as notificações">
          Em <strong>Loja</strong> →{" "}
          <strong>Ativar alertas neste aparelho</strong> →{" "}
          <strong>Permitir</strong>. Se o Android pedir, autorize também em
          Configurações → Apps → PrismaBook → Notificações.
        </Step>
      </ol>
      <div className="border-t border-line bg-background px-5 py-3 text-xs text-muted">
        Dica Samsung/Xiaomi: se não aparecer &quot;Instalar app&quot;, use
        &quot;Adicionar à tela inicial&quot;. Em alguns aparelhos o Chrome
        mostra um banner &quot;Instalar&quot; na barra de endereço — pode
        usar esse atalho.
      </div>
    </>
  );
}

export function MobileAppInstallGuide() {
  const [env, setEnv] = useState(detect);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<PlatformTab>("ios");

  useEffect(() => {
    const next = detect();
    setEnv(next);
    setTab(next.isAndroid ? "android" : "ios");
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

  const title =
    tab === "android" ? "App no celular (Android)" : "App no celular (iPhone)";
  const lead =
    tab === "android"
      ? "No Android, instale o PrismaBook pela tela inicial (Chrome) para receber reservas com o painel fechado."
      : "No iPhone as notificações de reserva só funcionam com o PrismaBook na Tela de Início. Siga os passos no Safari.";

  return (
    <div
      id="app-celular"
      className="overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow)]"
    >
      <div className="border-b border-line bg-accent-soft px-5 py-4">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm text-muted">{lead}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("ios")}
            className={`min-h-10 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "ios"
                ? "bg-accent text-white"
                : "border border-line bg-card text-muted"
            }`}
          >
            iPhone
          </button>
          <button
            type="button"
            onClick={() => setTab("android")}
            className={`min-h-10 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "android"
                ? "bg-accent text-white"
                : "border border-line bg-card text-muted"
            }`}
          >
            Android
          </button>
        </div>
      </div>

      {tab === "ios" ? <IosSteps /> : <AndroidSteps />}
    </div>
  );
}
