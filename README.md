# TwinFIT Support

Internal operations webapp for TwinFIT: **user support** and **exercise catalog** administration.

Stack: **Next.js (App Router) + React + TypeScript + Nhost Auth**.

## Features

| Module | Routes | Capabilities |
|--------|--------|--------------|
| **Support** | `/support`, `/support/[userId]` | Lookup by email, @username, or UUID; view plan (Google Play / Support grant) & activity; verify email, grant or revoke Premium; grant or revoke the `lab` and `staff` roles, disable account (admin only) |
| **Catalog** | `/catalog`, `/catalog/compose`, `/catalog/taxonomy` | Browse, create, edit system exercises; manage taxonomy lookups; deactivate exercises (admin only) |

Users with the Nhost **`staff`** or **`admin`** JWT role can sign in. Staff have read access and limited writes; admin retains destructive actions (disable account, deactivate exercise, unlink taxonomy) and role changes. An account holding both is **admin** everywhere in Support (admin > staff). Every GraphQL, Storage and Function request names that role in `x-hasura-role`, since the JWT's default role is `user`.

## Prerequisites

- Node.js 20+
- Access to the TwinFIT Nhost project (same as [TwinFIT-backend](../TwinFIT-backend))
- At least one staff or admin user (see below)

## Setup

```bash
cd TwinFIT-support
cp .env.local.example .env
# Edit .env with your Nhost subdomain/region (and OPENAI_API_KEY if using images)
npm install
npm run dev
```

`.env` is gitignored. Open [http://localhost:3000/login](http://localhost:3000/login).

## Environment variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Public | Nhost project subdomain |
| `NEXT_PUBLIC_NHOST_REGION` | Public | Nhost region (e.g. `eu-central-1`) |
| `NHOST_JWT_ISSUER` | Server, optional | When set, API routes also require this exact `iss` (Nhost Auth signs `https://<subdomain>.auth.<region>.nhost.run/v1`). Unset: no issuer check, as in the backend Functions (the project's JWKS already binds the token to the project) |
| `SUPPORT_BASE_URL` | Server | Origin of this Support deploy (e.g. `https://support.example.com`; https, or http on localhost). A long Images generation run continues in a fresh request on this URL; it is never taken from the request. Without it in production, the run stops after one request and open Images pages restart it. Defaults to `http://localhost:$PORT` in development. |

Support does **not** use `HASURA_GRAPHQL_ADMIN_SECRET`. All GraphQL reads and catalog writes go through the user's JWT (`staff` or `admin` role). Sensitive support writes call backend Functions that validate the JWT server-side.

## Provision staff and admin users

### Local (automatic)

`bash scripts/nhost/up-local.sh` in **TwinFIT-backend** ensures `auth.roles` (`staff` / `admin`) and seeds:

| Email | Password | Role |
|-------|----------|------|
| `admin@local.test` | `AdminLocal123!` | `admin` |
| `staff@local.test` | `StaffLocal123!` | `staff` |

Re-seed without restarting the stack:

```bash
cd ../TwinFIT-backend
bash scripts/nhost/seed-local-support-users.sh
```

### Cloud / custom emails

From **TwinFIT-backend** (requires `POSTGRES_URL` in `.secrets.remote`). Scripts ensure `auth.roles` first:

```bash
cd ../TwinFIT-backend
# Day-to-day support (lookup, verify email, subscription, catalog create/edit)
bash scripts/nhost/provision-staff.sh staff@yourcompany.com 'StrongPassword123!'

# Full admin (disable accounts, deactivate exercises, unlink taxonomy)
bash scripts/nhost/provision-admin.sh admin@yourcompany.com 'StrongPassword123!'
```

Both scripts set `default_role = user` so mobile app sessions stay scoped to the user's own data.

## Architecture

```
Browser (Nhost JWT, staff/admin role)
    → Next.js API routes (BFF)
        → Hasura GraphQL (Bearer JWT, staff/admin permissions)
        → Nhost Functions (verify email, Premium grant, disable account)
```

Support write actions call backend Functions:

- `admin-verify-email` (staff or admin)
- `admin-grant-premium` (staff or admin): Premium until a date, or revoke the Support grants
- `admin-set-user-disabled` (admin only)
- `admin-set-role` (admin only): grants or revokes `lab` or `staff` on an account; it gets the change in its next access token (next sign-in or refresh)
- `admin-accept-knowledge-candidate` (staff or admin): Coach → Knowledge → Candidates; drafts the source and cards of a PubMed candidate

Catalog writes go straight to Hasura with the caller's JWT (`src/lib/catalog/`, on `staffGql` in
`src/lib/staff-gql.ts`). An exercise update is one GraphQL mutation, so Hasura applies it in a
single transaction.

## GraphQL operations (Hasura allow-list)

The backend turns on Hasura's allow-list, which only accepts documents it knows. So every GraphQL
document Support sends is a fixed, named operation written with the `gql` tag
(`src/lib/gql.ts`), and `staffGql` only accepts such a document:

- Names start with `Support` and are unique (`SupportCoachListPromptVersions`). One operation per
  use: when a document varies (a table, an optional filter), write one operation per variant, as
  `src/lib/catalog/lookup-operations.ts` does per taxonomy table. Never build a document from
  strings. The only `${...}` allowed is a constant whose value is a string literal (a shared field
  list); the compiler rejects anything else.
- `graphql-manifest/support-current.json` lists them all, in the format the backend reads
  (`client`, `version`, `operations: [{ name, query }]`). Add or change an operation, then run
  `npm run graphql-manifest` and commit the result. `npm test` and `npm run build` fail when the
  manifest is out of date (`npm run graphql-manifest:check`).

## Security notes

- No Hasura admin secret in Support (local or production).
- Client sends JWT via `Authorization: Bearer` on every API call.
- Every API route verifies that JWT before doing anything (`requireStaffToken` / `requireAdminToken`
  in `src/lib/api-auth.ts`, `src/lib/nhost/verify-jwt.ts`), as the backend Functions do: RS256
  signature against the Nhost Auth JWKS (`https://<subdomain>.auth.<region>.nhost.run/v1/.well-known/jwks.json`,
  cached per server instance), `exp` required, `iss` only when `NHOST_JWT_ISSUER` is set, roles read from the verified
  `x-hasura-allowed-roles`. A missing, forged or expired token gets 401; a valid token without
  `staff` / `admin` gets 403 (admin-only routes: without `admin`); 503 when the JWKS cannot be read.
  New routes must call one of these first, before any server key (OpenAI, Mistral, …) is used.
- Non-staff users are rejected at login (UI hint only, unverified decode) and on API routes (403).
- Every API route reads its JSON body through `readJsonBody` (`src/lib/api-body.ts`): size-capped before parsing (1 MB, or the upload limit for base64 uploads) and checked with a zod schema; a bad body is a 400, an oversized one a 413.
- Server-side calls to Functions, Storage and the embeddings API have timeouts; Nhost URLs come from `nhostUrl()` (`src/lib/nhost/urls.ts`), which throws when the project is not configured.
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
npm test         # unit tests (include the GraphQL manifest check)
npm run graphql-manifest        # regenerate graphql-manifest/support-current.json
npm run graphql-manifest:check  # fail if it is out of date
```
