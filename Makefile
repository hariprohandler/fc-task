.DEFAULT_GOAL := help

.PHONY: help install lint lint-fix test test-ci build clean backend-install frontend-install root-install

help:
	@echo "FC Task — make targets (running make with no target shows this list):"
	@echo ""
	@echo "  make install     Install deps: npm ci at repo root, backend/, and frontend/"
	@echo "  make lint        ESLint backend + ng lint frontend"
	@echo "  make lint-fix    ESLint --fix backend + ng lint --fix frontend"
	@echo "  make test        Jest (backend) + Karma headless (frontend)"
	@echo "  make test-ci     Same as make test (alias)"
	@echo "  make build       Production builds for backend and frontend"
	@echo "  make clean       Remove dist/ and coverage artifacts under backend/ and frontend/"

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
	npm --prefix backend test
	npm --prefix frontend run test:ci

test-ci: test

build:
	npm --prefix backend run build
	npm --prefix frontend run build

clean:
	rm -rf backend/dist backend/coverage frontend/dist frontend/coverage
