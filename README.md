# FC Task — Airtable integration

Two-app workspace: **NestJS** API in `backend/`, **Angular 19** UI in `frontend/`.

## Full Documentation

For a single consolidated technical document (architecture, data flow, code structure, APIs, runbook, troubleshooting), see:

- `SYSTEM_DOCUMENTATION.md`

## Requirements

- **Node.js 22** (use [nvm](https://github.com/nvm-sh/nvm): `nvm use` reads `.nvmrc`)
- npm 10+
- MongoDB (for Parts A–B of the product spec)

## Quick start

```bash
nvm use
make install
```

The first `make install` runs `npm ci` at the repo root (Husky) and in `backend/` and `frontend/`.

Run APIs (MongoDB must be reachable; copy `backend/.env.example` → `backend/.env`):

```bash
cd backend && npm run start:dev
```

Validate against the live Airtable API: complete OAuth once (tokens in Mongo), then call `POST /api/airtable/sync` (and revision routes after storing cookies).

API base path: **`/api`**.

### Part A — Airtable (implemented in `backend/src/airtable/`)

**Authentication:** Configure an **[OAuth integration](https://airtable.com/create/oauth)** (`AIRTABLE_OAUTH_*` in `backend/.env`). API calls use `Authorization: Bearer <access_token>` from tokens stored in Mongo after the user completes `GET /api/airtable/oauth/login` (or the SPA uses `authorization-url`).

| Endpoint | Description |
|----------|-------------|
| `GET /api/airtable/oauth/authorization-url` | JSON `{ authorizationUrl, state }` |
| `GET /api/airtable/oauth/login` | 302 to Airtable consent |
| `GET /api/airtable/oauth/callback` | OAuth redirect URI (must match integration settings) |
| `GET /api/airtable/oauth/status` | `{ connected, auth: 'oauth' \| 'none' }` |
| `GET /api/airtable/oauth/refresh` | Rotate credentials using the stored refresh token |
| `POST /api/airtable/sync` | Full sync: paginated `GET /v0/meta/bases`, per-base `.../tables`, per-table records (`pageSize=100` + `offset`), and `GET /v0/users` |
| `POST /api/airtable/sync/bases` | Part A explicit sync for bases pages only |
| `POST /api/airtable/sync/tables` | Part A explicit sync for base table metadata pages only |
| `POST /api/airtable/sync/records` | Part A explicit sync for records pages only |
| `POST /api/airtable/sync/users` | Part A explicit sync for users pages only |

**MongoDB collections:** `airtable_oauth_tokens`, `airtable_oauth_state` (TTL), `airtable_bases_pages`, `airtable_tables_pages`, `airtable_records_pages`, `airtable_users_pages` (each stored document is one **API response page**).

Enable the OAuth scopes your sync needs (e.g. read schema + records). The **`/v0/users`** call may still fail on some plans; the sync completes and writes an error payload into `airtable_users_pages` when that happens.

Run UI:

```bash
cd frontend && npm start
```

## Makefile targets

| Target        | Description                                      |
|---------------|--------------------------------------------------|
| `make install` | `npm ci` at repo root + `backend/` + `frontend/` |
| `make lint`    | ESLint backend + `ng lint` frontend             |
| `make lint-fix`| ESLint `--fix` (backend) + `ng lint --fix` (frontend) |
| `make test`    | Prints reminder to use live API + OAuth + cookies (no automated suite) |
| `make build`   | Production builds for both apps                 |
| `make clean`   | Remove `dist/` and coverage artifacts           |

Root `npm run lint`, `npm run test`, and `npm run build` delegate to the same flows via Make.

## Stack (as specified)

- Angular **19**, Angular Material (+ Material Icons via Google Fonts in `index.html`)
- **AG Grid Community 33.0** with **AG Charts** 11.x (charts major version tracks AG Charts, not the grid)
- NestJS 11 (backend), ESLint 9 flat config
- **Node 22** — enforced via `.nvmrc` and `engines` in package manifests

## Git hooks

[Husky](https://typicode.github.io/husky/) runs on `npm install` at the repo root (`prepare` script). The pre-commit hook runs `make lint`.

Initialize git in this folder if hooks should run:

```bash
git init
npm install
```

## Project layout

```
fc-task/
├── .nvmrc
├── Makefile
├── package.json          # root devDependencies (husky only)
├── README.md
├── backend/              # NestJS — Airtable OAuth, MongoDB, scraping (Parts A–B)
└── frontend/             # Angular — AG Grid “raw data” style UI (Part C)
```

### Part B — Revision history (web cookies + JSON/HTML parsing)

After `POST /api/airtable/sync`, record IDs live in Mongo (`airtable_records_pages`). Revision history uses **Airtable web** cookies (separate from the OAuth API token).

Sign in to **airtable.com** in a normal browser, then use **`POST /api/airtable/web-session/cookies`** (or **Save cookies** on **`/airtable-session`**) with the full **`Cookie`** header from DevTools → Network.

| Endpoint | Description |
|----------|-------------|
| `GET /api/airtable/web-session/status` | Whether a cookie header is stored + last validation |
| `POST /api/airtable/web-session/cookies` | Body `{ cookieHeader }` — store cookies from DevTools |
| `POST /api/airtable/web-session/validate` | Body `{}` for light check, or `{ sample: { baseId, tableId, rowId } }` to hit the revision API once |
| `POST /api/airtable/revision/sync` | Body optional `{ baseId?, tableId?, maxRecords?, delayMs? }`. **401** with `error: "COOKIE_NOT_VALID"` if cookies are missing or rejected by Airtable |
| `POST /api/airtable/revision/fetch` | Body `{ baseId, tableId, rowId }` — same **401** + `COOKIE_NOT_VALID` when the session is invalid |
| `GET /api/airtable/revision/entries` | Query `issueId`, `baseId`, `limit` (reads Mongo only; no Airtable cookie) |

Revision HTTP (path, query, headers, referer view segment) is defined in **`backend/src/airtable/airtable-revision-http.constants.ts`** — edit that file to match DevTools; only **cookies** are stored via the API/Mongo. Optional logging: `AIRTABLE_VENDOR_LOG`, `AIRTABLE_REVISION_DEBUG` (see `airtable-vendor-log.ts`).

The Angular app serves **Airtable web session** at **`/airtable-session`** (cookie paste + validation). `ng serve` proxies `/api` to `http://localhost:3000`.

### Part C — Raw Data UI (`frontend/src/app/raw-data/`)

Open **`http://localhost:4200`**: **Active integration** defaults to **Airtable**; **Entity** lists allowed Mongo collections (sync pages, revision entries, web session). Click **Load grid** to fetch up to 8k documents (then use the **Search** box for quick filter, **column menu (⋮) → Filter tab** or the header filter icon for per-column filters, plus **sorting** and **pagination**). The grid uses AG Grid’s **legacy** column menu so `filterMenuTab` is available (the default `new` menu ignores tab config). Columns are built dynamically from the union of top-level fields (nested values are JSON strings).

| Endpoint | Description |
|----------|-------------|
| `GET /api/raw-data/integrations` | `[{ id, label, connected }]` — Airtable only |
| `GET /api/raw-data/entities?integrationId=airtable` | `{ entities: { rawEntities, processedEntities } }` — raw = live `airtable_*` Mongo collections (minus OAuth/state drafts); processed = `processed_changelog` only |
| `GET /api/raw-data/rows?integrationId=airtable&collection=…` | `{ fields, rows, totalInDb, truncated }` |

## Next implementation steps (task brief)

1. Optional hardening: server-side search, auth on raw-data routes, finer-grained collection ACLs.

## License

Private / evaluation use unless stated otherwise.
