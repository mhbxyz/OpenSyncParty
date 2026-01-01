UV ?= uv
VENV ?= .venv
PY := $(VENV)/bin/python

.PHONY: help venv sync-server sync-mpv sync-tests sync-all server demo mpv-host mpv-join test-harness test \
	compose-up compose-down compose-server compose-demo compose-harness \
	jellyfin-up jellyfin-down jellyfin-build-plugin jellyfin-build-plugin-local jellyfin-logs

help:
	@echo "OpenSyncParty targets:"
	@echo "  make server        - run session server (uv venv + deps)"
	@echo "  make demo          - serve web demo on :8000"
	@echo "  make mpv-host      - run MPV adapter as host (ROOM=...)"
	@echo "  make mpv-join      - run MPV adapter as joiner (ROOM=...)"
	@echo "  make test-harness  - run protocol harness"
	@echo "  make test          - run pytest suite"
	@echo "  make compose-up    - start docker compose services"
	@echo "  make compose-down  - stop docker compose services"
	@echo "  make compose-demo  - start web demo service"
	@echo "  make compose-server- start session server service"
	@echo "  make compose-harness - run protocol harness service"
	@echo "  make jellyfin-up   - start Jellyfin stack (infra/docker)"
	@echo "  make jellyfin-down - stop Jellyfin stack (infra/docker)"
	@echo "  make jellyfin-build-plugin - build Jellyfin server plugin"
	@echo "  make jellyfin-logs - tail Jellyfin container logs"
	@echo "  make venv          - create uv virtual env"

venv:
	$(UV) venv $(VENV)

sync-server:
	$(UV) sync --group server

sync-mpv:
	$(UV) sync --group mpv

sync-tests:
	$(UV) sync --group tests

sync-all:
	$(UV) sync --group all

server: sync-server
	$(PY) session-server/app.py

demo: venv
	$(PY) -m http.server 8000 --directory clients/web-overlay

mpv-host: sync-mpv
	@if [ -z "$(ROOM)" ]; then echo "ROOM is required (e.g. make mpv-host ROOM=my-room)"; exit 1; fi
	$(PY) clients/mpv/opensyncparty.py --room $(ROOM) --host $(ARGS)

mpv-join: sync-mpv
	@if [ -z "$(ROOM)" ]; then echo "ROOM is required (e.g. make mpv-join ROOM=my-room)"; exit 1; fi
	$(PY) clients/mpv/opensyncparty.py --room $(ROOM) $(ARGS)

test-harness: sync-tests
	$(PY) tests/protocol_harness.py --ws ws://localhost:8999/ws

test: sync-tests
	$(PY) -m pytest tests

compose-up:
	docker compose up --build

compose-down:
	docker compose down

compose-server:
	docker compose up --build session-server

compose-demo:
	docker compose up --build web-demo

compose-harness:
	docker compose run --rm protocol-harness

jellyfin-up:
	docker compose -f infra/docker/docker-compose.yml up -d jellyfin session-server redis

jellyfin-down:
	docker compose -f infra/docker/docker-compose.yml down

jellyfin-build-plugin:
	docker compose -f infra/docker/docker-compose.yml run --rm plugin-builder

jellyfin-build-plugin-local:
	./scripts/build-jellyfin-plugin.sh

jellyfin-logs:
	docker compose -f infra/docker/docker-compose.yml logs -f jellyfin
