# FC Task — Airtable integration

Two-app workspace: **NestJS** API in `backend/`, **Angular 19** UI in `frontend/`.

## Full Documentation

For a single consolidated technical document (architecture, data flow, code structure, APIs, runbook, troubleshooting), see:

- `SYSTEM_DOCUMENTATION.md`

## Requirements

- **Node.js 22** (use [nvm](https://github.com/nvm-sh/nvm): `nvm use` reads `.nvmrc`)
- npm 10+
- MongoDB (for Parts A–B of the product spec)
- Chrome or Chromium (for frontend unit tests in headless mode)

## Quick start

```bash
nvm use
make install
```

The first `make install` runs `npm ci` at the repo root (Husky) and in `backend/` and `frontend/`. Frontend tests use Puppeteer’s Chromium when `CHROME_BIN` is unset; the browser is downloaded on first `npm install` in `frontend/`.

Run APIs (MongoDB must be reachable; copy `backend/.env.example` → `backend/.env`):

```bash
cd backend && npm run start:dev
```

Smoke-test PAT + Mongo against the live Airtable API (uses `backend/.env`, does not print your token):

```bash
cd backend && npm run test:airtable
```

API base path: **`/api`**.

### Part A — Airtable (implemented in `backend/src/airtable/`)

**Authentication:** Airtable has deprecated legacy API keys. Prefer a **[personal access token](https://airtable.com/create/tokens)** (`AIRTABLE_PERSONAL_ACCESS_TOKEN` in `backend/.env`); the API uses `Authorization: Bearer <token>` the same way as an OAuth access token. If a PAT is set, it **always** wins over any stored OAuth tokens. OAuth routes remain available only when you **omit** the PAT (integrations at [airtable.com/create/oauth](https://airtable.com/create/oauth)).

| Endpoint | Description |
|----------|-------------|
| `GET /api/airtable/oauth/authorization-url` | JSON `{ authorizationUrl, state }` (400 if PAT is configured) |
| `GET /api/airtable/oauth/login` | 302 to Airtable consent (400 if PAT is configured) |
| `GET /api/airtable/oauth/callback` | OAuth redirect URI (must match integration settings) |
| `GET /api/airtable/oauth/status` | `{ connected, auth: 'pat' \| 'oauth' \| 'none' }` |
| `GET /api/airtable/oauth/refresh` | OAuth refresh only (400 if PAT is configured) |
| `POST /api/airtable/sync` | Full sync: paginated `GET /v0/meta/bases`, per-base `.../tables`, per-table records (`pageSize=100` + `offset`), and `GET /v0/users` |

**MongoDB collections:** `airtable_oauth_tokens`, `airtable_oauth_state` (TTL), `airtable_bases_pages`, `airtable_tables_pages`, `airtable_records_pages`, `airtable_users_pages` (each stored document is one **API response page**).

Give the PAT the scopes your sync needs (e.g. read schema + records). The **`/v0/users`** call may still fail on some plans; the sync completes and writes an error payload into `airtable_users_pages` when that happens.

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
| `make test`    | Jest (backend) + Karma headless (frontend)      |
| `make build`   | Production builds for both apps                 |
| `make clean`   | Remove `dist/` and coverage artifacts           |

Root `npm run lint`, `npm run test`, and `npm run build` delegate to the same flows via Make.

## Stack (as specified)

- Angular **19**, Angular Material (+ Material Icons via Google Fonts in `index.html`)
- **AG Grid Community 33.0** with **AG Charts** 11.x (charts major version tracks AG Charts, not the grid)
- NestJS 11 (backend), ESLint 9 flat config, Jest
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

### Part B — Revision history (web cookies + HTML)

After `POST /api/airtable/sync`, record IDs live in Mongo (`airtable_records_pages`). Revision history uses **Airtable web** cookies (not the PAT/OAuth API token).

**If you sign in with Google (or Apple / SSO):** use **`POST /api/airtable/web-session/cookies`** (or **Save cookies** on `/airtable-session`) — log into airtable.com in a normal browser, copy the **`Cookie`** header from DevTools → Network, paste it here. Automated Playwright login does **not** run Google’s OAuth flow; it only targets Airtable’s own email+password form.

**If your Airtable account uses email + password on Airtable’s login page:** optional Playwright automation (`login/begin`, `login/complete`). Install Chromium once: `cd backend && npx playwright install chromium`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/airtable/web-session/status` | Whether a cookie header is stored + last validation |
| `POST /api/airtable/web-session/cookies` | Body `{ cookieHeader }` — **primary path for Google/SSO** (paste from DevTools) |
| `POST /api/airtable/web-session/validate` | Body `{}` for light check, or `{ sample: { baseId, tableId, rowId } }` to POST the revision endpoint once |
| `POST /api/airtable/web-session/login/begin` | **Email/password on Airtable only** — body optional `{ email, password }` (else `AIRTABLE_WEB_*` env). Returns `{ mfaRequired, sessionKey }` when MFA is needed |
| `POST /api/airtable/web-session/login/complete` | Body `{ sessionKey, mfaCode }` after MFA |
| `POST /api/airtable/revision/sync` | Body optional `{ baseId?, tableId?, maxRecords?, delayMs? }` — fetches HTML per record, parses **Assignee** and **Status** only, upserts `airtable_revision_entries` |
| `GET /api/airtable/revision/entries` | Query `issueId`, `baseId`, `limit` |

Configure `AIRTABLE_REVISION_HISTORY_PATH_TEMPLATE` and `AIRTABLE_REVISION_POST_BODY_TEMPLATE` to match what you see in the browser Network tab for `readRowActivitiesAndComments`. Override DOM selectors with `AIRTABLE_REVISION_HTML_SELECTORS` (JSON) if the default `[data-revision-entry]` fixture shape does not match production HTML.

Jest bulk test: `npm test -- --testPathPatterns=airtable-revision` (200 mocked record fetches).

The Angular app serves **Airtable web session** at **`/airtable-session`** (MFA + validation). `ng serve` proxies `/api` to `http://localhost:3000`.

### Part C — Raw Data UI (`frontend/src/app/raw-data/`)

Open **`http://localhost:4200`**: **Active integration** defaults to **Airtable**; **Entity** lists allowed Mongo collections (sync pages, revision entries, web session). Click **Load grid** to fetch up to 8k documents (then use the **Search** box for quick filter, **column menu (⋮) → Filter tab** or the header filter icon for per-column filters, plus **sorting** and **pagination**). The grid uses AG Grid’s **legacy** column menu so `filterMenuTab` is available (the default `new` menu ignores tab config). Columns are built dynamically from the union of top-level fields (nested values are JSON strings).

| Endpoint | Description |
|----------|-------------|
| `GET /api/raw-data/integrations` | e.g. `[{ id: airtable, label: Airtable }]` |
| `GET /api/raw-data/entities?integrationId=airtable` | `{ entities: { rawEntities, processedEntities } }` — sync API pages vs processed (e.g. `processed_changelog`) |
| `GET /api/raw-data/rows?integrationId=airtable&collection=…` | `{ fields, rows, totalInDb, truncated }` |

## Next implementation steps (task brief)

1. Optional hardening: server-side search, auth on raw-data routes, finer-grained collection ACLs.

## License

Private / evaluation use unless stated otherwise.
