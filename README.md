# TwinFIT Support

Internal operations webapp for TwinFIT: **user support** and **exercise catalog** administration.

Stack: **Next.js (App Router) + React + TypeScript + Nhost Auth**.

## Features

| Module | Routes | Capabilities |
|--------|--------|--------------|
| **Support** | `/support`, `/support/[userId]` | Lookup by email, @username, or UUID; view subscription & activity; verify email, set tier; disable account (admin only) |
| **Catalog** | `/catalog`, `/catalog/compose`, `/catalog/taxonomy` | Browse, create, edit system exercises; manage taxonomy lookups; deactivate exercises (admin only) |

Users with the Nhost **`staff`** or **`admin`** JWT role can sign in. Staff have read access and limited writes; admin retains destructive actions (disable account, deactivate exercise, unlink taxonomy).

## Prerequisites

- Node.js 20+
- Access to the TwinFIT Nhost project (same as [TwinFIT-backend](../TwinFIT-backend))
- At least one staff or admin user (see below)

## Setup

```bash
cd TwinFIT-support
cp .env.local.example .env.local
# Edit .env.local with your Nhost subdomain and region
npm install
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

## Environment variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Public | Nhost project subdomain |
| `NEXT_PUBLIC_NHOST_REGION` | Public | Nhost region (e.g. `eu-central-1`) |

Support does **not** use `HASURA_GRAPHQL_ADMIN_SECRET`. All GraphQL reads and catalog writes go through the user's JWT (`staff` or `admin` role). Sensitive support writes call backend Functions that validate the JWT server-side.

## Provision staff and admin users

From **TwinFIT-backend** (requires `POSTGRES_URL` in `.secrets.remote`):

```bash
cd ../TwinFIT-backend
# Day-to-day support (lookup, verify email, subscription, catalog create/edit)
bash scripts/nhost/provision-staff.sh staff@yourcompany.com 'StrongPassword123!'

# Full admin (disable accounts, deactivate exercises, unlink taxonomy)
bash scripts/nhost/provision-admin.sh admin@yourcompany.com 'StrongPassword123!'
```

Both scripts set `default_role = user` so mobile app sessions stay scoped to the user's own data.

Manual alternative:

```sql
INSERT INTO auth.user_roles (user_id, role)
VALUES ('<uuid>', 'staff');
```

## Architecture

```
Browser (Nhost JWT, staff/admin role)
    → Next.js API routes (BFF)
        → Hasura GraphQL (Bearer JWT, staff/admin permissions)
        → Nhost Functions (verify email, subscription, catalog update with internal admin secret)
```

Support write actions call backend Functions:

- `admin-verify-email` (staff or admin)
- `admin-set-subscription` (staff or admin)
- `admin-set-user-disabled` (admin only)
- `staff-catalog-update` (staff or admin; exercise edits that replace child rows)

Catalog logic is ported from [TwinFIT-CatalogWeb](../TwinFIT-CatalogWeb/) (`src/lib/catalog/crud.js`).

## Security notes

- No Hasura admin secret in Support (local or production).
- Client sends JWT via `Authorization: Bearer` on every API call.
- Non-staff users are rejected at login and on API routes (403).
- Deploy behind VPN or IP allowlist for production; do not expose publicly without additional hardening.

## Related repos

| Repo | Role |
|------|------|
| [TwinFIT-backend](../TwinFIT-backend) | Nhost mold, staff/admin Functions, Hasura metadata |
| [TwinFIT-CatalogWeb](../TwinFIT-CatalogWeb) | **Deprecated** — use this app for catalog admin |
| [TwinFit-app](../TwinFit-app) | Android client |

## Scripts

```bash
npm run dev      # development server (port 3000)
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint
```
