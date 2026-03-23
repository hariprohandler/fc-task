# FC Task — Airtable integration

Two-app workspace: **NestJS** API in `backend/`, **Angular 19** UI in `frontend/`.

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

Run APIs:

```bash
cd backend && npm run start:dev
```

Run UI:

```bash
cd frontend && npm start
```

## Makefile targets

| Target        | Description                                      |
|---------------|--------------------------------------------------|
| `make install` | `npm ci` in `backend/` and `frontend/`         |
| `make lint`    | ESLint backend + `ng lint` frontend             |
| `make lint-fix`| ESLint with `--fix` on backend only             |
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

## Next implementation steps (task brief)

1. **Part A:** Airtable OAuth; sync `/meta/bases`, `/meta/bases/:id/tables`, `/:baseId/:tableId` (paginated), `/v0/users` into MongoDB collections.
2. **Part B:** Session cookies + `/readRowActivitiesAndComments` HTML parsing for Assignee/Status changes; MFA from UI; cookie validity checks.
3. **Part C:** Material UI with integration/entity dropdowns, AG Grid with dynamic columns, quick filter/search, column sort/filter.

## License

Private / evaluation use unless stated otherwise.
