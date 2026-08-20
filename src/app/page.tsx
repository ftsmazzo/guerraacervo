import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PlanPicker } from "@/components/landing/plan-picker";
import { businessPlans, libraryPlans, personalPlans } from "@/lib/plans";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "PrismaBook — catálogo e WhatsApp para sebos",
  description:
    "Cadastre livros pela foto, atenda no WhatsApp com o estoque certo e feche reservas sem planilha. 14 dias grátis, sem cartão.",
  openGraph: {
    title: "PrismaBook — o sebo no WhatsApp",
    description:
      "Catálogo sob controle e atendimento no Zap. 14 dias grátis, sem cartão.",
    url: "/",
    siteName: "PrismaBook",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "PrismaBook" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PrismaBook — o sebo no WhatsApp",
    description:
      "Catálogo sob controle e atendimento no Zap. 14 dias grátis, sem cartão.",
    images: ["/og.jpg"],
  },
};

export default function HomePage() {
  const negocio = businessPlans();
  const pessoal = personalPlans();
  const bibliotecas = libraryPlans();

  return (
    <div className="landing">
      <section className="landing-hero" aria-label="Apresentação">
        <Image
          src="/hero-landing.jpg"
          alt="Sebo com prateleiras de livros, lumiar de prisma e uma mesa de leitura"
          fill
          priority
          quality={88}
          sizes="100vw"
          className="landing-hero__photo"
        />
        <div className="landing-hero__shade" aria-hidden="true" />

        <nav className="landing-nav landing-nav--hero" aria-label="Principal">
          <Link href="/" className="landing-nav__brand">
            <Image
              src="/prismabook-icon.png"
              alt=""
              width={28}
              height={28}
              className="landing-nav__mark"
              priority
            />
            PrismaBook
          </Link>
          <div className="landing-nav__links">
            <a href="#como-funciona" className="landing-nav__link">
              Como funciona
            </a>
            <a href="#planos" className="landing-nav__link">
              Para sebos
            </a>
            <a href="#para-voce" className="landing-nav__link">
              Para você
            </a>
            <Link href="/login" className="landing-nav__link">
              Entrar
            </Link>
            <a href="#planos" className="landing-nav__cta">
              Começar grátis
            </a>
          </div>
        </nav>

        <div className="landing-hero__inner">
          <p className="landing-hero__kicker">Sistema para sebos</p>
          <h1 className="landing-hero__headline">
            Seu acervo, no WhatsApp de quem compra.
          </h1>
          <p className="landing-hero__lead">
            Cadastre pela foto, atenda com o estoque certo e feche reservas sem
            planilha. 14 dias grátis, sem cartão.
          </p>
          <div className="landing-hero__cta">
            <a href="#planos" className="landing-btn landing-btn--primary">
              Começar 14 dias grátis
            </a>
            <a href="#como-funciona" className="landing-btn landing-btn--ghost">
              Ver como funciona
            </a>
          </div>
          <ul className="landing-hero__trust">
            <li>Sem cartão no trial</li>
            <li>Catálogo real no Zap</li>
            <li>Feito para sebo brasileiro</li>
          </ul>
        </div>
      </section>

      <section className="landing-proof" aria-label="O que o PrismaBook faz">
        <div className="landing-proof__inner">
          <article>
            <h2>Foto, ISBN ou lote</h2>
            <p>Sobe o livro pela capa. A ficha nasce pronta para vender.</p>
          </article>
          <article>
            <h2>WhatsApp com estoque</h2>
            <p>O atendimento consulta o catálogo. Sem inventar o que não tem.</p>
          </article>
          <article>
            <h2>Vitrine pública</h2>
            <p>Um link do sebo para o cliente ver títulos, preço e estado.</p>
          </article>
          <article>
            <h2>Pedidos no painel</h2>
            <p>Reserva, cliente e estoque no mesmo lugar. Sem planilha paralela.</p>
          </article>
        </div>
      </section>

      <section
        id="como-funciona"
        className="landing-how"
        aria-labelledby="how-title"
      >
        <div className="landing-section">
          <h2 id="how-title" className="landing-section__title">
            Do primeiro livro ao primeiro atendimento
          </h2>
          <p className="landing-section__lead">
            Em três passos o sebo entra no ar. Você testa 14 dias, sem cartão.
          </p>
          <div className="landing-how__steps">
            <article className="landing-how__step">
              <p className="landing-how__n">01</p>
              <h3>Crie a conta</h3>
              <p>
                Confirme seu WhatsApp e entre no painel. O trial começa na hora
                — a assinatura fica para depois, se fizer sentido.
              </p>
            </article>
            <article className="landing-how__step">
              <p className="landing-how__n">02</p>
              <h3>Monte o acervo</h3>
              <p>
                Tire foto da capa, busque o ISBN ou cadastre em lote. Preço,
                estado e estoque ficam no catálogo.
              </p>
            </article>
            <article className="landing-how__step">
              <p className="landing-how__n">03</p>
              <h3>Conecte o Zap do sebo</h3>
              <p>
                No painel, em Loja, ligue o número que já atende seus clientes.
                O PrismaBook passa a responder com o que você realmente tem.
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
            Escolha pela faixa do estoque. 14 dias grátis, sem cartão. Você
            muda o plano depois, em Assinatura.
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
            Para você, leitor
          </h2>
          <p className="landing-section__lead">
            Organize a estante, anote o que procura e, em breve, receba aviso
            quando um sebo tiver o livro.
          </p>
          <PlanPicker
            plans={pessoal}
            defaultPlanCode="personal_biblioteca"
            signupProduct="personal"
          />
        </div>
      </section>

      <section
        id="bibliotecas"
        className="landing-how"
        aria-labelledby="library-title"
      >
        <div className="landing-section">
          <h2 id="library-title" className="landing-section__title">
            Para bibliotecas da instituição
          </h2>
          <p className="landing-section__lead">
            Empresa, condomínio, igreja, ONG ou clube: empreste e devolva no
            celular, com catálogo público e lembrete no WhatsApp. Sem sistema
            acadêmico.
          </p>
          <PlanPicker
            plans={bibliotecas}
            defaultPlanCode="library_comunidade"
            signupProduct="library"
          />
        </div>
      </section>

      <section className="landing-close" aria-labelledby="close-title">
        <p className="landing-hero__kicker landing-hero__kicker--dark">
          Comece hoje
        </p>
        <h2 id="close-title" className="landing-section__title">
          Abra o sebo digital neste mês.
        </h2>
        <p>
          Trial de 14 dias. Sem cartão, sem compromisso no período de teste.
        </p>
        <a href="#planos" className="landing-btn landing-btn--primary">
          Escolher plano
        </a>
      </section>

      <footer className="landing-footer">
        <Link href="/" className="landing-footer__brand">
          PrismaBook
        </Link>
        <p>© {new Date().getFullYear()} · catálogo, WhatsApp e vendas para sebos</p>
        <div className="landing-footer__links">
          <Link href="/login">Entrar</Link>
          <Link href="/cadastro">Cadastro</Link>
        </div>
      </footer>
    </div>
  );
}
