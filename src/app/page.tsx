import Image from "next/image";
import Link from "next/link";
import { PlanPicker } from "@/components/landing/plan-picker";
import { businessPlans, personalPlans } from "@/lib/plans";
import "@/components/landing/landing.css";

export default function HomePage() {
  const negocio = businessPlans();
  const pessoal = personalPlans();

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
        <div className="flex items-center gap-4">
          <a href="#para-voce" className="landing-nav__link">
            Para você
          </a>
          <a href="#planos" className="landing-nav__link">
            Para sebos
          </a>
          <Link href="/login" className="landing-nav__link">
            Entrar
          </Link>
        </div>
      </nav>

      <section className="landing-hero" aria-label="Apresentação">
        <div className="landing-hero__inner">
          <h1 className="landing-hero__brand">PrismaBook</h1>
          <p className="landing-hero__headline">
            O sebo no WhatsApp, com catálogo sob controle.
          </p>
          <p className="landing-hero__lead">
            Cadastre livros, atenda clientes e venda pelo Zap — 14 dias grátis,
            sem cartão, para testar o plano Negócio.
          </p>
          <div className="landing-hero__cta">
            <a href="#planos" className="landing-btn landing-btn--primary">
              Começar teste
            </a>
            <a href="#para-voce" className="landing-btn landing-btn--ghost">
              Sou leitor
            </a>
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
                Confirme seu WhatsApp e entre no painel. Sem cartão no trial —
                você assina só depois de usar o sistema.
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
            Escolha a faixa do estoque. 14 dias grátis, sem cartão. Você pode
            mudar o plano depois em Assinatura.
          </p>
          <PlanPicker plans={negocio} defaultPlanCode="business_profissional" />
        </div>
      </section>

      <section
        id="para-voce"
        className="landing-how"
        aria-labelledby="personal-title"
      >
        <div className="landing-section">
          <h2 id="personal-title" className="landing-section__title">
            Para você
          </h2>
          <p className="landing-section__lead">
            Organize sua biblioteca, registre o que procura e, em breve, receba
            avisos quando um sebo tiver o livro.
          </p>
          <PlanPicker
            plans={pessoal}
            defaultPlanCode="personal_biblioteca"
            signupProduct="personal"
          />
        </div>
      </section>

      <section className="landing-close" aria-labelledby="close-title">
        <h2 id="close-title" className="landing-section__title">
          Pronto para abrir o sebo digital?
        </h2>
        <p>Trial de 14 dias. Sem cartão, sem compromisso no período de teste.</p>
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
