# Docker

Container definitions and compose setups.

## Jellyfin + OpenSyncParty

Le `docker-compose.yml` provisionne:

- Jellyfin 10.11.3
- Session server (WS)
- Redis
- Un builder pour compiler le plugin Jellyfin (server-side)
- Le plugin UI Jellyfin Web monté par défaut

### Build plugin Jellyfin (server-side)

```bash
docker compose run --rm plugin-builder
```

Si le build échoue pour raisons réseau/TLS, tu peux builder en local:

```bash
make jellyfin-build-plugin-local
```

### Démarrer Jellyfin + session-server

```bash
docker compose up -d jellyfin session-server redis
```

### Notes

- Le plugin UI web est monté depuis `clients/web-plugin/`.
- Le plugin server est monté depuis `plugins/jellyfin/OpenSyncParty/dist/`.
- Ouvre Jellyfin sur `http://localhost:8096`.
- Le session server utilise `uv` via `pyproject.toml`.
