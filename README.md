# GuerraAcervo SaaS

Base web multi-tenant para sebos e coleções.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL 17 + Drizzle ORM
- Redis 7
- Planos/entitlements em `src/lib/plans.ts`

## Subir infra local

Requer Docker Desktop (ou engine compatível):

```bash
docker compose up -d
```

Portas: Postgres `5433`, Redis `6380` (para não conflitar com outros projetos).

Se o Docker não estiver instalado nesta máquina, use um Postgres/Redis remoto (ou o do EasyPanel) e ajuste `DATABASE_URL` / `REDIS_URL` no `.env`.

## App

```bash
cp .env.example .env   # se ainda não tiver
npm install
npm run db:push
npm run db:seed
npm run dev
```

Abra http://localhost:3000

Seed padrão:

- E-mail: `admin@guerraacervo.local`
- Senha: `admin123`
- Tenant: `sebo-demo` (trial 7 dias)

Health: http://localhost:3000/api/health

## Estrutura

- `src/db/schema` — tenants, users, memberships, books, clients, orders
- `src/lib/plans.ts` — Pessoal + Negócio
- `src/app/painel` — shell operacional do sebo
- `src/app/admin` — control plane (stub)
- `src/app/login` — auth stub (próxima etapa)

## Deploy (EasyPanel)

Serviços: `app` (Dockerfile) + `postgres` + `redis`.

No start do container o entrypoint roda `scripts/bootstrap.mjs` (migrate + seed).
Não executar migration/seed via shell em produção.

Variáveis principais no app:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `RUN_SEED` (default: true; use `false` para pular seed)

## Roadmap

1. Auth real + limites por plano
2. CRUD portado (livros → clientes → pedidos)
3. Stripe Billing (planos Negócio)
4. Loja pública WhatsApp (Master)
5. IAs (ISBN, precificação, atendimento)
