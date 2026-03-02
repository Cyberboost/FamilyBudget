# 💰 FamilyBudget

A modern, secure family budgeting web app built with Next.js 14, TypeScript, Tailwind CSS, Clerk Auth, Plaid bank integration, and PostgreSQL/Prisma.

> **MVP scope:** Read-only bank data (no money movement). All financial totals are calculated from database queries — no AI math.

---

## Features

| Feature | Description |
|---------|-------------|
| **Auth + Family Workspace** | Clerk email/password auth with MFA support. Create a family, invite members, accept invites, assign roles. |
| **RBAC** | Four roles: `PARENT_ADMIN`, `PARENT`, `TEEN`, `KID`. Parents see everything; kids see only what parents share. |
| **Plaid Connect** | Create Link token → exchange public token → store encrypted access token → sync accounts + transactions. |
| **Transactions** | List, search, and filter transactions. Manual category override. Create merchant→category rules. |
| **Budgets** | Monthly category limits + dashboard summary (remaining/overspent per category + totals). |
| **Goals** | Savings/spending goals + progress tracking + per-child sharing settings. |
| **Kid View** | Goal progress, allowance placeholder, limited spend summary based on sharing rules. |
| **Weekly Insights** | Math-based: top categories, month-over-month deltas, budget burn rate. |
| **Audit Logs** | Every permission change, bank connection, budget edit, and sharing change is logged. |
| **Rate Limiting** | Sensitive endpoints (Plaid connect, token exchange, sync) are rate-limited. |

---

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API routes (Route Handlers)
- **Database:** PostgreSQL + Prisma ORM (v7)
- **Auth:** Clerk (email/password + MFA)
- **Bank Aggregation:** Plaid (Link flow + transactions sync)
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
│   ├── (auth)/                 # Sign-in / Sign-up pages (Clerk)
│   ├── (dashboard)/            # Authenticated app pages
│   │   ├── dashboard/          # Main dashboard
│   │   ├── transactions/       # Transaction list + filters
│   │   ├── budgets/            # Monthly budget management
│   │   ├── goals/              # Savings goals
│   │   ├── insights/           # Weekly math-based insights
│   │   ├── kids/               # Kid-friendly view
│   │   └── settings/           # Family settings + bank connections
│   ├── api/
│   │   ├── family/             # Family CRUD + member management + invites
│   │   ├── invites/accept/     # Accept family invite
│   │   ├── plaid/              # create-link-token, exchange-token, sync
│   │   ├── transactions/       # List, category override, merchant rules
│   │   ├── budgets/            # Monthly budgets CRUD
│   │   ├── goals/              # Goals CRUD + sharing
│   │   └── insights/           # Weekly analytics
│   ├── invites/accept/         # Invite acceptance UI
│   └── onboarding/             # Create family workspace UI
├── components/
│   └── plaid/PlaidConnectButton.tsx  # Plaid Link client component
├── lib/
│   ├── prisma.ts               # Prisma client singleton (with PG adapter)
│   ├── plaid.ts                # Plaid API client
│   ├── rbac.ts                 # Role-based access control + auth helpers
│   ├── audit.ts                # Audit logging
│   ├── encryption.ts           # AES-256-GCM encrypt/decrypt for Plaid tokens
│   └── rateLimit.ts            # Rate limiting (Upstash or in-memory)
├── prisma/
│   └── schema.prisma           # Database schema
├── prisma.config.ts            # Prisma 7 configuration
├── middleware.ts               # Clerk auth middleware
└── .env.example                # Environment variable template
```

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/Cyberboost/FamilyBudget.git
cd FamilyBudget
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in your `.env.local`:

```env
# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/familybudget"

# Clerk (https://clerk.com → create app)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Plaid (https://plaid.com → create app, use sandbox for dev)
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox

# Encryption key for Plaid tokens (generate once, keep secret)
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: Upstash Redis for production rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 3. Set up the database

```bash
# Push the schema to your Postgres database
npx prisma migrate dev --name init

# Or for production
npx prisma migrate deploy
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/family` | any | Create family workspace |
| `GET`  | `/api/family` | member | Get current family |
| `GET`  | `/api/family/members` | member | List members |
| `PATCH`| `/api/family/members` | PARENT_ADMIN | Update member role |
| `DELETE`| `/api/family/members` | PARENT_ADMIN | Remove member |
| `POST` | `/api/family/invites` | PARENT+ | Send invite |
| `GET`  | `/api/family/invites` | PARENT+ | List pending invites |
| `DELETE`| `/api/family/invites` | PARENT_ADMIN | Revoke invite |
| `POST` | `/api/invites/accept` | authenticated | Accept invite |

### Plaid
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/plaid/create-link-token` | PARENT+ | Create Plaid Link token |
| `POST` | `/api/plaid/exchange-token` | PARENT+ | Exchange public token → store encrypted access token |
| `POST` | `/api/plaid/sync` | PARENT+ | Sync transactions (incremental) |

### Transactions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/transactions` | PARENT/TEEN | List with pagination + filters |
| `PATCH`| `/api/transactions/[id]` | PARENT+ | Override category |
| `GET`  | `/api/transactions/merchant-rules` | member | List rules |
| `POST` | `/api/transactions/merchant-rules` | PARENT+ | Create rule |
| `DELETE`| `/api/transactions/merchant-rules` | PARENT+ | Delete rule |

### Budgets
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/budgets?year&month` | PARENT/TEEN | Budgets + spending summary |
| `POST` | `/api/budgets` | PARENT+ | Upsert budget limit |
| `DELETE`| `/api/budgets` | PARENT_ADMIN | Delete budget |

### Goals
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/goals` | member | List (kids see only shared goals) |
| `POST` | `/api/goals` | PARENT+ | Create goal |
| `PATCH`| `/api/goals/[id]` | PARENT+ | Update goal |
| `DELETE`| `/api/goals/[id]` | PARENT_ADMIN | Delete goal |
| `PUT`  | `/api/goals/[id]/share` | PARENT+ | Update sharing settings |

### Insights
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/insights?year&month` | PARENT/TEEN | Top categories, MoM deltas, burn rates |

---

## Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import to Vercel
3. Set all environment variables from `.env.example`
4. Add a PostgreSQL database (Vercel Postgres, Supabase, Railway, etc.)
5. Run migrations: `npx prisma migrate deploy`

### Production checklist

- [ ] Set `ENCRYPTION_KEY` to a securely generated 64-char hex string
- [ ] Set `PLAID_ENV=production` (requires Plaid production access)
- [ ] Configure Upstash Redis for distributed rate limiting
- [ ] Enable Clerk MFA in your Clerk dashboard
- [ ] Set up database backups
- [ ] Review and restrict Plaid webhook permissions

---

## Development

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check
npx prisma studio # Visual database browser
```

---

## License

MIT
