# 💰 FamilyBudget

A modern, secure family budgeting web app built with Next.js 15 (App Router), TypeScript, Tailwind CSS, Clerk Auth, Plaid bank integration, and PostgreSQL/Prisma.

> **MVP scope:** Read-only bank data (no money movement). All financial totals are calculated from database queries — no AI math.

---

## Features

| Feature                     | Description                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Auth + Family Workspace** | Clerk email/password auth with MFA support. Create a family, invite members, accept invites, assign roles.     |
| **RBAC**                    | Four roles: `PARENT_ADMIN`, `PARENT`, `TEEN`, `KID`. Parents see everything; kids see only what parents share. |
| **Plaid Connect**           | Create Link token → exchange public token → store encrypted access token → sync accounts + transactions.       |
| **Transactions**            | List, search, and filter transactions. Manual category override. Create merchant→category rules.               |
| **Budgets**                 | Monthly category limits + dashboard summary (remaining/overspent per category + totals).                       |
| **Goals**                   | Savings/spending goals + progress tracking + per-child sharing settings.                                       |
| **Kid View**                | Goal progress, allowance placeholder, limited spend summary based on sharing rules.                            |
| **Weekly Insights**         | Math-based: top categories, month-over-month deltas, budget burn rate.                                         |
| **Audit Logs**              | Every permission change, bank connection, budget edit, and sharing change is logged.                           |
| **Rate Limiting**           | Sensitive endpoints (Plaid connect, token exchange, sync) are rate-limited.                                    |

---

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API routes (Route Handlers)
- **Database:** PostgreSQL + Prisma ORM (v7)
- **Auth:** Clerk (email/password + MFA)
- **Bank Aggregation:** Plaid (Link flow + transactions sync)
- **Validation:** Zod (all API request bodies)
- **Linting / Formatting:** ESLint + Prettier
- **Rate Limiting:** Upstash Redis (with in-memory fallback for dev)

---

## Security

- ✅ Bank credentials are **never stored** — Plaid handles authentication
- ✅ Plaid access tokens are **encrypted at rest** using AES-256-GCM
- ✅ **Server-side authorization** on every API route (Clerk user + family membership + role)
- ✅ **Audit logs** for all sensitive operations
- ✅ **Rate limiting** on Plaid endpoints and sync operations
- ✅ RBAC enforced at the API layer — kids cannot access adult views

---

## Project Structure

```
.
├── app/
│   ├── (auth)/                        # Sign-in / Sign-up pages (Clerk catch-all)
│   │   ├── sign-in/[[...sign-in]]/
│   │   └── sign-up/[[...sign-up]]/
│   ├── (dashboard)/                   # Authenticated app shell + pages
│   │   ├── layout.tsx                 # Sidebar navigation
│   │   ├── dashboard/                 # Summary dashboard
│   │   ├── transactions/              # Transaction list + filters
│   │   ├── budgets/                   # Monthly budget management
│   │   ├── goals/                     # Savings goals
│   │   ├── insights/                  # Math-based weekly insights
│   │   ├── kids/                      # Kid-friendly goal view
│   │   └── settings/                  # Family settings + bank connections
│   ├── api/
│   │   ├── family/                    # Family CRUD + member management
│   │   │   ├── route.ts               # GET/POST family
│   │   │   ├── members/route.ts       # GET/PATCH/DELETE members
│   │   │   └── invites/route.ts       # GET/POST/DELETE invites
│   │   ├── invites/accept/route.ts    # POST – accept invite by token
│   │   ├── plaid/
│   │   │   ├── create-link-token/     # POST – generate Plaid Link token
│   │   │   ├── exchange-token/        # POST – swap public_token, store encrypted
│   │   │   └── sync/                  # POST – incremental transaction sync
│   │   ├── transactions/
│   │   │   ├── route.ts               # GET – paginated list + filters
│   │   │   ├── [id]/route.ts          # PATCH – category override
│   │   │   └── merchant-rules/route.ts# GET/POST/DELETE merchant→category rules
│   │   ├── budgets/route.ts           # GET/POST/DELETE monthly budgets
│   │   ├── goals/
│   │   │   ├── route.ts               # GET/POST goals
│   │   │   └── [id]/
│   │   │       ├── route.ts           # PATCH/DELETE goal
│   │   │       └── share/route.ts     # PUT – update sharing
│   │   └── insights/route.ts          # GET – weekly analytics
│   ├── invites/accept/page.tsx        # Invite acceptance UI (client)
│   ├── onboarding/page.tsx            # Create family workspace UI
│   ├── layout.tsx                     # Root layout (ClerkProvider)
│   └── page.tsx                       # Landing / home page
├── components/
│   └── plaid/
│       └── PlaidConnectButton.tsx     # Plaid Link client component
├── lib/
│   ├── audit.ts                       # Audit log helper
│   ├── encryption.ts                  # AES-256-GCM encrypt/decrypt for Plaid tokens
│   ├── logger.ts                      # Structured logger (JSON in prod, pretty in dev)
│   ├── plaid.ts                       # Plaid API client singleton
│   ├── prisma.ts                      # Prisma client singleton (with PG adapter)
│   ├── rateLimit.ts                   # Rate limiting (Upstash or in-memory fallback)
│   └── rbac.ts                        # RBAC helpers: requireAuth, requireFamilyRole,
│                                      #   getActiveFamily, requireRole, ApiError, …
├── prisma/
│   └── schema.prisma                  # Database schema
├── prisma.config.ts                   # Prisma 7 datasource + migration config
├── middleware.ts                      # Clerk auth middleware (protects all non-public routes)
├── .env.example                       # Environment variable template
├── .eslintrc.json                     # ESLint config (next/core-web-vitals + next/typescript)
├── .prettierrc                        # Prettier config
└── tailwind.config.ts                 # Tailwind CSS config
```

---

## Setup

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 14+ (local or hosted)
- [Clerk](https://clerk.com) account
- [Plaid](https://plaid.com) developer account (free Sandbox tier is enough)

### 1 · Clone and install

```bash
git clone https://github.com/Cyberboost/FamilyBudget.git
cd FamilyBudget
npm install
```

### 2 · Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every variable (see comments in the file).  
At minimum you need:

| Variable                            | Where to get it                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | Your Postgres connection string                                                           |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys                                                                |
| `CLERK_SECRET_KEY`                  | Clerk dashboard → API Keys                                                                |
| `PLAID_CLIENT_ID`                   | Plaid dashboard → Team Settings → Keys                                                    |
| `PLAID_SECRET`                      | Plaid dashboard → Team Settings → Keys (Sandbox secret)                                   |
| `ENCRYPTION_KEY`                    | Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

---

## Running Locally

```bash
# 1. Apply database migrations (first run or after schema changes)
npm run prisma:migrate

# 2. Start the Next.js dev server (hot-reload enabled)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Additional dev commands:

```bash
npm run lint          # ESLint (also runs during CI)
npm run format        # Prettier — auto-fix formatting
npm run format:check  # Prettier — check only (no writes, use in CI)
npx tsc --noEmit      # TypeScript type check without emitting files
```

---

## Database Migrations

Prisma manages all schema changes through migration files.

```bash
# Create and apply a new migration (dev only)
npm run prisma:migrate
# → prompted for a migration name, e.g. "add_allowance_column"

# Apply pending migrations in production / CI
npm run prisma:migrate:deploy

# Reset the database and re-apply all migrations (⚠ destroys all data)
npm run prisma:reset

# Regenerate the Prisma client after schema edits (without migrating)
npm run prisma:generate

# Open Prisma Studio (visual database browser)
npm run prisma:studio
```

> **Tip:** After editing `prisma/schema.prisma` in development always run
> `npm run prisma:migrate` so the generated client and your local DB stay in sync.

---

## Plaid Sandbox Usage

The app ships pre-configured for the **Plaid Sandbox** environment, which
lets you test the full bank-connection flow without real bank credentials.

### Setup

1. Set `PLAID_ENV=sandbox` in `.env.local` (this is the default in `.env.example`).
2. Use your **Sandbox** secret from the Plaid dashboard (not the Development or Production secret).

### Connecting a test bank account

1. Sign in and complete onboarding (create a family workspace).
2. Go to **Settings → Connected Banks → Connect Bank**.
3. Plaid Link opens. Choose any institution (e.g. "Chase").
4. Use the Plaid test credentials:
   - **Username:** `user_good`
   - **Password:** `pass_good`
5. Click **Continue** — Plaid returns a `public_token`.
6. The app exchanges it for an encrypted `access_token` stored in your DB.

### Syncing transactions

Call the sync endpoint once after connecting:

```bash
curl -X POST http://localhost:3000/api/plaid/sync \
  -H "Cookie: <your-clerk-session-cookie>"
```

Or navigate to the **Transactions** page — it will show the synced data.

### Plaid Sandbox test credentials cheat-sheet

| Scenario                    | Username                   | Password    |
| --------------------------- | -------------------------- | ----------- |
| Successful login            | `user_good`                | `pass_good` |
| Requires MFA (code: `1234`) | `user_good`                | `pass_good` |
| Bad credentials             | `user_bad`                 | `pass_bad`  |
| Expired item                | `user_expired_credentials` | `pass_good` |

Full reference: [Plaid Sandbox docs](https://plaid.com/docs/sandbox/)

---

## Data Model (simplified)

```
Family
  ├── FamilyMember  (clerkId, role: PARENT_ADMIN|PARENT|TEEN|KID)
  ├── Invite        (email, token, expiresAt, status)
  ├── PlaidItem     (encryptedAccessToken, cursor)
  │     └── Account (name, type, balances)
  │           └── Transaction (amount, date, category)
  ├── MerchantRule  (merchantName → category)
  ├── Budget        (year, month, category, limitAmount)
  ├── Goal          (targetAmount, savedAmount)
  │     └── GoalShare (clerkId of child who can see it)
  └── AuditLog      (actorId, action, metadata)
```

---

## API Reference

### Family

| Method   | Path                  | Min Role      | Description             |
| -------- | --------------------- | ------------- | ----------------------- |
| `POST`   | `/api/family`         | authenticated | Create family workspace |
| `GET`    | `/api/family`         | member        | Get current family      |
| `GET`    | `/api/family/members` | member        | List members            |
| `PATCH`  | `/api/family/members` | PARENT_ADMIN  | Update member role      |
| `DELETE` | `/api/family/members` | PARENT_ADMIN  | Remove member           |
| `POST`   | `/api/family/invites` | PARENT        | Send invite             |
| `GET`    | `/api/family/invites` | PARENT        | List pending invites    |
| `DELETE` | `/api/family/invites` | PARENT_ADMIN  | Revoke invite           |
| `POST`   | `/api/invites/accept` | authenticated | Accept invite by token  |

### Plaid

| Method | Path                           | Min Role | Description                                          |
| ------ | ------------------------------ | -------- | ---------------------------------------------------- |
| `POST` | `/api/plaid/create-link-token` | PARENT   | Create Plaid Link token                              |
| `POST` | `/api/plaid/exchange-token`    | PARENT   | Exchange public token → store encrypted access token |
| `POST` | `/api/plaid/sync`              | PARENT   | Sync transactions (incremental cursor)               |

### Transactions

| Method   | Path                               | Min Role | Description                    |
| -------- | ---------------------------------- | -------- | ------------------------------ |
| `GET`    | `/api/transactions`                | TEEN     | List with pagination + filters |
| `PATCH`  | `/api/transactions/[id]`           | PARENT   | Override category              |
| `GET`    | `/api/transactions/merchant-rules` | member   | List rules                     |
| `POST`   | `/api/transactions/merchant-rules` | PARENT   | Create rule                    |
| `DELETE` | `/api/transactions/merchant-rules` | PARENT   | Delete rule                    |

### Budgets

| Method   | Path                      | Min Role     | Description                |
| -------- | ------------------------- | ------------ | -------------------------- |
| `GET`    | `/api/budgets?year&month` | TEEN         | Budgets + spending summary |
| `POST`   | `/api/budgets`            | PARENT       | Upsert budget limit        |
| `DELETE` | `/api/budgets`            | PARENT_ADMIN | Delete budget              |

### Goals

| Method   | Path                    | Min Role     | Description                       |
| -------- | ----------------------- | ------------ | --------------------------------- |
| `GET`    | `/api/goals`            | member       | List (kids see only shared goals) |
| `POST`   | `/api/goals`            | PARENT       | Create goal                       |
| `PATCH`  | `/api/goals/[id]`       | PARENT       | Update goal                       |
| `DELETE` | `/api/goals/[id]`       | PARENT_ADMIN | Delete goal                       |
| `PUT`    | `/api/goals/[id]/share` | PARENT       | Update sharing settings           |

### Insights

| Method | Path                       | Min Role | Description                            |
| ------ | -------------------------- | -------- | -------------------------------------- |
| `GET`  | `/api/insights?year&month` | TEEN     | Top categories, MoM deltas, burn rates |

---

## RBAC Helpers (`lib/rbac.ts`)

All route handlers use these server-side helpers (imported from `@/lib/rbac`):

```ts
// Throws 401 if not authenticated. Returns the Clerk userId.
await requireAuth();

// Throws 403 if user is not in the given family with at least `minRole`.
await requireFamilyRole(familyId, Role.PARENT);

// Returns the Family record for the current user. Throws if no family.
await getActiveFamily();

// Low-level: FamilyMember record or throws (no role check).
await requireAnyFamilyMember();
```

---

## Deployment

### Vercel (recommended)

1. Push to GitHub and import the repo in Vercel.
2. Set all environment variables from `.env.example`.
3. Add a PostgreSQL database (Vercel Postgres, Supabase, Railway, etc.).
4. Add a build command override: `npm run prisma:migrate:deploy && npm run build`.

### Production checklist

- [ ] Generate a fresh `ENCRYPTION_KEY` (64-char hex, never reuse across environments)
- [ ] Set `PLAID_ENV=production` (requires approved Plaid production access)
- [ ] Provision Upstash Redis and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- [ ] Enable Clerk MFA in your Clerk dashboard
- [ ] Set up automated database backups
- [ ] Review and restrict Plaid webhook IP allowlist

---

## License

MIT
