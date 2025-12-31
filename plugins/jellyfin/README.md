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

## Notes

Les versions NuGet sont alignées sur Jellyfin 10.9.x par défaut. Ajuste les
versions selon ta version de Jellyfin.
