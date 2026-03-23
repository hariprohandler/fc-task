.PHONY: install lint lint-fix test test-ci build clean backend-install frontend-install

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
