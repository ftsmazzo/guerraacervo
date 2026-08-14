import Image from "next/image";
import Link from "next/link";
import { PlanPicker } from "@/components/landing/plan-picker";
import { businessPlans } from "@/lib/plans";
import "@/components/landing/landing.css";

export default function HomePage() {
  const negocio = businessPlans();

  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Principal">
        <span className="landing-nav__brand">
          <Image
            src="/prismabook-icon.png"
            alt=""
            width={28}
            height={28}
            className="landing-nav__mark"
            priority
          />
          PrismaBook
        </span>
        <Link href="/login" className="landing-nav__link">
          Entrar
        </Link>
      </nav>

      <section className="landing-hero" aria-label="Apresentação">
        <div className="landing-hero__inner">
          <h1 className="landing-hero__brand">PrismaBook</h1>
          <p className="landing-hero__headline">
            O sebo no WhatsApp, com catálogo sob controle.
          </p>
          <p className="landing-hero__lead">
            Cadastre livros, atenda clientes e venda pelo Zap — 14 dias para
            testar o plano Negócio.
          </p>
          <div className="landing-hero__cta">
            <a href="#planos" className="landing-btn landing-btn--primary">
              Começar teste
            </a>
            <Link href="/login" className="landing-btn landing-btn--ghost">
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-how" aria-labelledby="how-title">
        <div className="landing-section">
          <h2 id="how-title" className="landing-section__title">
            Como funciona
          </h2>
          <p className="landing-section__lead">
            Do cadastro ao atendimento no WhatsApp do sebo, em três passos.
          </p>
          <div className="landing-how__steps">
            <article className="landing-how__step">
              <p className="landing-how__n">01</p>
              <h3>Crie a conta</h3>
              <p>
                Escolha o plano, confirme seu WhatsApp e inicie o trial com
                cartão — cobrança só depois dos 14 dias.
              </p>
            </article>
            <article className="landing-how__step">
              <p className="landing-how__n">02</p>
              <h3>Conecte o Zap do sebo</h3>
              <p>
                No painel, em Loja, escaneie o QR da Evolution e ligue o número
                que atende seus clientes.
              </p>
            </article>
            <article className="landing-how__step">
              <p className="landing-how__n">03</p>
              <h3>Atenda e venda</h3>
              <p>
                O agente consulta o catálogo, sugere títulos e encaminha reservas
                enquanto você controla estoque e pedidos.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        id="planos"
        className="landing-plans"
        aria-labelledby="plans-title"
      >
        <div className="landing-section">
          <h2 id="plans-title" className="landing-section__title">
            Planos Negócio
          </h2>
          <p className="landing-section__lead">
            Escolha a faixa do estoque. Você pode mudar depois no portal da
            assinatura.
          </p>
          <PlanPicker plans={negocio} defaultPlanCode="business_profissional" />
        </div>
      </section>

      <section className="landing-close" aria-labelledby="close-title">
        <h2 id="close-title" className="landing-section__title">
          Pronto para abrir o sebo digital?
        </h2>
        <p>Trial de 14 dias. Sem compromisso no período de teste.</p>
        <a href="#planos" className="landing-btn landing-btn--primary">
          Escolher plano
        </a>
      </section>

      <footer className="landing-footer">
        © {new Date().getFullYear()} PrismaBook
      </footer>
    </div>
  );
}
