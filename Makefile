.DEFAULT_GOAL := help

.PHONY: help install lint lint-fix test build clean backend-install frontend-install root-install run-backend run-frontend run

help:
	@echo "FC Task — make targets (running make with no target shows this list):"
	@echo ""
	@echo "  make install     Install deps: npm ci at repo root, backend/, and frontend/"
	@echo "  make lint        ESLint backend + ng lint frontend"
	@echo "  make lint-fix    ESLint --fix backend + ng lint --fix frontend"
	@echo "  make test        No-op (this repo validates via live API + OAuth + cookies)"
	@echo "  make build       Production builds for backend and frontend"
	@echo "  make clean       Remove dist/ and coverage artifacts under backend/ and frontend/"
	@echo "  make run-backend Run NestJS API in watch mode (backend)"
	@echo "  make run-frontend Run Angular dev server (frontend)"
	@echo "  make run         Run backend + frontend together"

# Install root (husky) + both apps (CI-friendly: npm ci when lockfiles exist)
install: root-install backend-install frontend-install

root-install:
	npm ci

backend-install:
	npm --prefix backend ci

frontend-install:
	npm --prefix frontend ci

lint:
	npm --prefix backend run lint
	npm --prefix frontend run lint

lint-fix:
	npm --prefix backend run lint:fix
	npm --prefix frontend run lint:fix

test:
	@echo "No automated test suite. Use OAuth in .env, store cookies in Mongo, then call the sync/revision API routes."

build:
	npm --prefix backend run build
	npm --prefix frontend run build

clean:
	rm -rf backend/dist backend/coverage frontend/dist frontend/coverage

run-backend:
	npm --prefix backend run start:dev

run-frontend:
	npm --prefix frontend run start

# Starts backend in background and keeps frontend in foreground.
# Ctrl+C stops both.
run:
	@set -e; \
	npm --prefix backend run start:dev & \
	BACKEND_PID=$$!; \
	trap 'kill $$BACKEND_PID 2>/dev/null || true' INT TERM EXIT; \
	npm --prefix frontend run start
