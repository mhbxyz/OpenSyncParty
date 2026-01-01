.PHONY: help compose-up compose-down jellyfin-sync-refs jellyfin-build-plugin jellyfin-logs

help:
	@echo "OpenSyncParty targets:"
	@echo "  make compose-up    - start jellyfin stack (and build plugin if needed)"
	@echo "  make compose-down  - stop jellyfin stack"
	@echo "  make jellyfin-sync-refs - sync Jellyfin DLL refs from container"
	@echo "  make jellyfin-build-plugin - build Jellyfin server plugin"
	@echo "  make jellyfin-logs - tail Jellyfin container logs"

compose-up: jellyfin-build-plugin
	docker compose -f infra/docker/docker-compose.yml up -d jellyfin

compose-down:
	docker compose -f infra/docker/docker-compose.yml down

jellyfin-sync-refs:
	./scripts/sync-jellyfin-refs.sh

jellyfin-build-plugin: jellyfin-sync-refs
	docker compose -f infra/docker/docker-compose.yml run --rm plugin-builder

jellyfin-logs:
	docker compose -f infra/docker/docker-compose.yml logs -f jellyfin