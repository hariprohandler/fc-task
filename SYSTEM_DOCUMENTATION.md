# FC Task - System Documentation

This is the single source of truth for architecture, data flow, code structure, API surface, and run/verify steps for this repository.

## 1) Overview

This project has two applications:

- `backend/` - NestJS API that integrates with Airtable, stores data in MongoDB, fetches revision history, and exposes raw-data APIs.
- `frontend/` - Angular 19 UI with AG Grid to browse stored collections and run search/filter/sort operations.

High-level capabilities:

- Airtable metadata and records sync (Part A)
- Revision history scraping/parsing for Status and Assignee changes (Part B)
- Raw Data UI with dynamic columns and collection browsing (Part C)

## 2) Architecture

### Backend modules

- `AirtableModule` (`backend/src/airtable/`)
  - OAuth token handling
  - Airtable API pagination sync
  - Web session cookie management
  - Revision history fetching/parsing/storage
- `RawDataModule` (`backend/src/raw-data/`)
  - Lists integrations/entities
  - Returns documents in a grid-friendly format

### Frontend routes

- `/` - Raw Data grid page
- `/logs` - Raw Data logs placeholder
- `/airtable-session` - Airtable web session panel (cookie paste + validation)

## 3) End-to-End Data Flow

## A. Airtable API Sync Flow (Part A)

1. Client calls `POST /api/airtable/sync`.
2. Backend uses the stored OAuth access token (with refresh when needed).
3. Backend paginates Airtable APIs:
   - bases -> tables -> records -> users
4. Each Airtable page response is stored as one Mongo document.

Stored collections:

- `airtable_bases_pages`
- `airtable_tables_pages`
- `airtable_records_pages`
- `airtable_users_pages`

## B. Revision History Flow (Part B)

1. Store Airtable web cookies: `POST /api/airtable/web-session/cookies` (paste `Cookie` from DevTools).
2. Client calls `POST /api/airtable/revision/sync`. If cookies are missing or Airtable returns **401/403**, the API responds with **401** and body `{ "error": "COOKIE_NOT_VALID", "message": "…" }`.
3. Backend reads record IDs from `airtable_records_pages`.
4. For each record, backend calls Airtable web endpoint (`readRowActivitiesAndComments`) using cookie auth.
5. Response HTML (or JSON-wrapped HTML) is parsed for:
   - `status` changes
   - `assignee` changes
6. Parsed rows are upserted into `airtable_revision_entries`.

Revision entry shape:

- `uuid`
- `issueId`
- `columnType` (`status` or `assignee`)
- `oldValue`
- `newValue`
- `createdDate`
- `authoredBy`
- `baseId`
- `tableId`

## C. Raw Data UI Flow (Part C)

1. UI loads integrations from `GET /api/raw-data/integrations`.
2. UI loads entities from `GET /api/raw-data/entities?integrationId=airtable`.
3. User picks Entity or Processed Entity and clicks **Load grid**.
4. UI requests `GET /api/raw-data/rows?...`.
5. Backend returns:
   - `fields`: dynamic column list
   - `rows`: flattened/stringified row values
   - `totalInDb`, `truncated`
6. AG Grid renders dynamic columns with sort/filter/search/pagination.

## 4) Backend Code Structure

`backend/src/airtable/`

- `airtable-api.service.ts` - generic Airtable request + pagination helpers
- `airtable-oauth.service.ts` - OAuth token lifecycle (store, refresh, valid access token)
- `airtable-sync.service.ts` - sync orchestration and Mongo writes
- `airtable-web-session.service.ts` - cookie storage and validation against airtable.com
- `airtable-revision-sync.service.ts` - revision fetch + parse + upsert loop
- `airtable-revision-html.parser.ts` - structured + heuristic parser for status/assignee changes
- `oauth.controller.ts`, `sync.controller.ts`, `web-session.controller.ts`, `revision.controller.ts`
- `schemas/` - Mongoose schemas for all persisted entities

`backend/src/raw-data/`

- `raw-data.constants.ts` - blocklist, processed collection id, limits
- `raw-data.service.ts` - data shaping for grid responses
- `raw-data.controller.ts` - raw-data API endpoints

## 5) Frontend Code Structure

`frontend/src/app/raw-data/`

- `raw-data.component.ts` - grid state, entity loading, quick filter, column visibility
- `raw-data.component.html` - top controls + AG Grid + column panel
- `raw-data.component.scss` - UI styling
- `raw-data-logs.component.ts` - logs placeholder page

Other key files:

- `app.routes.ts` - route map
- `airtable-web-session-panel.component.ts` - cookie/session UI
- `airtable-session-page.component.ts` - wrapper route for session panel
- `main.ts` - AG Grid module registration

## 6) API Reference (Current)

Base URL: `/api`

### Airtable OAuth + sync

- `GET /airtable/oauth/authorization-url`
- `GET /airtable/oauth/login`
- `GET /airtable/oauth/callback`
- `GET /airtable/oauth/status`
- `GET /airtable/oauth/refresh`
- `POST /airtable/sync`

### Airtable web session + revision

- `GET /airtable/web-session/status`
- `POST /airtable/web-session/cookies`
- `POST /airtable/web-session/validate`
- `POST /airtable/revision/sync` (401 + `COOKIE_NOT_VALID` when session invalid)
- `POST /airtable/revision/fetch` (single-row test; 401 + `COOKIE_NOT_VALID` when session invalid)
- `GET /airtable/revision/entries`

### Raw data

- `GET /raw-data/integrations`
- `GET /raw-data/entities?integrationId=airtable`
- `GET /raw-data/rows?integrationId=airtable&collection=<name>&limit=<n>`

## 7) Configuration

Primary env file: `backend/.env`

Important keys:

- `MONGODB_URI`
- `AIRTABLE_OAUTH_*` (OAuth client, redirect, scopes)
- `AIRTABLE_WEB_HOST`
- `AIRTABLE_API_BASE`
- Optional vendor logging: `AIRTABLE_VENDOR_LOG`, `AIRTABLE_REVISION_DEBUG` (see `airtable-vendor-log.ts`)

Revision **web** request shape (headers, query `stringifiedObjectParams` / `requestId` / `secretSocketId`, referer, client code version) lives in **`airtable-revision-http.constants.ts`**, not in `.env`.

## 8) Run and Verify

Install:

```bash
nvm use
make install
```

Run backend:

```bash
cd backend && npm run start:dev
```

Run frontend:

```bash
cd frontend && npm start
```

Quality checks:

```bash
make lint
make build
```

`make test` only prints a short reminder: this repo is validated against the **live** Airtable API (OAuth in `.env`, cookies in Mongo, then sync/revision HTTP routes).

## 9) Troubleshooting

- Entity dropdown empty:
  - Ensure frontend expects `entities.rawEntities` and `entities.processedEntities` (nested shape).
- Sorting works but filter missing:
  - Grid must use legacy column menu for tabbed filter menu.
  - Verify header menu appears and filter icon is not suppressed.
- Revision sync gives 0 entries:
  - Cookie may be invalid.
  - Update `airtable-revision-http.constants.ts` (path, referer view segment, `x-airtable-inter-service-client-code-version`, etc.) to match DevTools for your base.
  - Adjust `REVISION_HTML_SELECTORS_JSON` in that file if responses are not the standard JSON shape.
- Google login account:
  - Use cookie paste path, not automated email/password flow.

## 10) Security and Data Access Notes

- Raw data API is intentionally whitelist-based for collections.
- OAuth token/state collections are excluded from Raw Data UI exposure.
- For production-hardening, add auth and role checks on raw-data endpoints.

