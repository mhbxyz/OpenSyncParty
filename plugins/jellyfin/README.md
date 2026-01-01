# Jellyfin Plugin

Minimal Jellyfin server plugin for auth/token issuance and watch-party entry points.

## Structure

- `OpenSyncParty/` plugin source (C#)
- Endpoints:
  - `POST /OpenSyncParty/token` (JWT pour l'utilisateur connecté)
  - `POST /OpenSyncParty/invite` (JWT d'invitation pour une room)

## Configuration

Configure the shared secret to match the session server:

- `JwtSecret` (doit correspondre à `JWT_SECRET`)
- `JwtAudience` / `JwtIssuer` (optionnels)
- Les rôles Jellyfin sont inclus dans le JWT (claim `role`)

## Notes

Les versions NuGet sont alignées sur Jellyfin 10.9.x par défaut. Ajuste les
versions selon ta version de Jellyfin.

## Build & install (local)

```bash
cd plugins/jellyfin/OpenSyncParty
dotnet build -c Release
```

Copie le binaire dans le dossier plugins de Jellyfin (ex: `~/.local/share/jellyfin/plugins/OpenSyncParty`),
puis redémarre Jellyfin.

Pour packager:

```bash
dotnet publish -c Release -o ./dist
```

## Notes NuGet

Les dépendances Jellyfin sont sur `https://nuget.jellyfin.org/v3/index.json`.
Un `nuget.config` est fourni pour résoudre correctement les packages.
