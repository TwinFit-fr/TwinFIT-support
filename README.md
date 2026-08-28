# TwinFIT Support

Internal operations webapp for TwinFIT: **user support** and **exercise catalog** administration.

Stack: **Next.js (App Router) + React + TypeScript + Nhost Auth**.

## Features

| Module | Routes | Capabilities |
|--------|--------|--------------|
| **Support** | `/support`, `/support/[userId]` | Lookup by email, @username, or UUID; view subscription & activity; verify email, set tier, disable account |
| **Catalog** | `/catalog`, `/catalog/compose`, `/catalog/taxonomy` | Browse, create, edit, deactivate system exercises; manage taxonomy lookups |

Only users with the Nhost **`admin`** role can sign in.

## Prerequisites

- Node.js 20+
- Access to the TwinFIT Nhost project (same as [TwinFIT-backend](../TwinFIT-backend))
- `HASURA_GRAPHQL_ADMIN_SECRET` (server-side only)
- At least one admin user (see below)

## Setup

```bash
cd TwinFIT-support
cp .env.local.example .env.local
# Edit .env.local with your Nhost subdomain, region, and admin secret
npm install
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

## Environment variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Public | Nhost project subdomain |
| `NEXT_PUBLIC_NHOST_REGION` | Public | Nhost region (e.g. `eu-central-1`) |
| `HASURA_GRAPHQL_ADMIN_SECRET` | **Server only** | Hasura admin secret for reads and catalog writes |

Never prefix the admin secret with `NEXT_PUBLIC_`.

## Provision an admin user

From **TwinFIT-backend** (requires `POSTGRES_URL` in `.secrets.remote`):

```bash
cd ../TwinFIT-backend
bash scripts/nhost/provision-admin.sh admin@yourcompany.com 'StrongPassword123!'
```

This creates (or updates) an `auth.users` row and grants the `admin` role in `auth.user_roles`.

Manual alternative:

```sql
INSERT INTO auth.user_roles (user_id, role)
VALUES ('<uuid>', 'admin');
```

## Architecture

```
Browser (Nhost JWT, admin role)
    → Next.js API routes (BFF)
        → Hasura admin secret (reads + catalog CRUD)
        → Nhost Functions admin-* (support writes)
```

Support write actions call backend Functions:

- `admin-verify-email`
- `admin-set-subscription`
- `admin-set-user-disabled`

Catalog logic is ported from [TwinFIT-CatalogWeb](../TwinFIT-CatalogWeb/) (`src/lib/catalog/crud.js`).

## Security notes

- Admin secret stays on the server (API routes only).
- Client sends JWT via `Authorization: Bearer` on every API call.
- Non-admin users are rejected at login and on API routes (403).
- Deploy behind VPN or IP allowlist for production; do not expose publicly without additional hardening.

## Related repos

| Repo | Role |
|------|------|
| [TwinFIT-backend](../TwinFIT-backend) | Nhost mold, admin Functions, `admin` role in `nhost.toml` |
| [TwinFIT-CatalogWeb](../TwinFIT-CatalogWeb) | **Deprecated** — use this app for catalog admin |
| [TwinFit-app](../TwinFit-app) | Android client |

## Scripts

```bash
npm run dev      # development server (port 3000)
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint
```
