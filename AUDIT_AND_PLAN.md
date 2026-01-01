# Audit et Plan de Correction - OpenSyncParty

**Date:** 01 Janvier 2026
**Version:** 1.0
**Statut:** MVP / PoC avancé

## 1. Résumé Exécutif

Le projet `OpenSyncParty` dispose d'une architecture cohérente et fonctionnelle pour un MVP. Les briques principales (Server Python, Client MPV, Overlay Web, Plugin Jellyfin) sont en place.

Cependant, plusieurs points d'attention critiques ont été relevés, notamment des risques de concurrence (race conditions) sur le serveur, des incohérences mineures dans le protocole entre les clients, et une divergence entre l'infrastructure déclarée (Redis) et l'implémentation réelle (In-Memory).

## 2. Analyse des Criticités (Bugs & Risques)

### 2.1 Serveur de Session (`session-server/app.py`)
*   **Race Condition Critique :** La fonction `broadcast` itère directement sur `room.clients.items()`. Si un client se déconnecte ou rejoint pendant l'itération (qui contient un `await`), cela lèvera une `RuntimeError: dictionary changed size during iteration`.
    *   *Correction :* Itérer sur une copie de la liste : `list(room.clients.items())`.
*   **Absence de Persistance (In-Memory vs Redis) :** Le fichier `PLAN.md` et `infra/docker/docker-compose.yml` mentionnent Redis, mais le code utilise uniquement un dictionnaire Python en mémoire. Si le serveur redémarre ou si plusieurs workers sont lancés, l'état est perdu/incohérent.
*   **Gestion des erreurs WebSocket :** Le bloc `try/except` global dans `websocket_endpoint` est correct, mais la gestion fine des erreurs de parsing JSON pourrait être améliorée pour ne pas déconnecter le client brutalement.

### 2.2 Client MPV (`clients/mpv/opensyncparty.py`)
*   **Protocole Incomplet :** Le client MPV ne gère pas le champ `play_state` dans le message `state_update`. Si l'hôte met en pause via une mise à jour d'état (et non un événement joueur), le client MPV risque de rester en lecture.
*   **Gestion des déconnexions :** Le client tente de se reconnecter uniquement au démarrage. Une perte de connexion WS en cours de lecture n'est pas gérée automatiquement (pas de boucle de reconnexion robuste).

### 2.3 Plugin Jellyfin (`OpenSyncPartyPlugin`)
*   **Sécurité :** Le contrôleur expose `/OpenSyncParty/token` qui génère un JWT. Bien qu'il vérifie l'authentification Jellyfin (`[Authorize]`), il faut s'assurer que la configuration (`JwtSecret`) est bien chargée et non vide par défaut.
*   **Dépendances :** Le build a été corrigé (NET 9, refs locales), ce point est résolu.

### 2.4 Infrastructure
*   **Redis inutile :** Le conteneur `redis` est lancé dans `infra/docker/docker-compose.yml` mais n'est utilisé nulle part par le code actuel.

## 3. Améliorations de la Qualité du Code

*   **Typage Python :** L'usage de `dict` génériques pour les payloads WS est fragile.
    *   *Action :* Utiliser `TypedDict` ou des modèles `Pydantic` pour valider la structure des messages entrants et sortants.
*   **JavaScript (Web Client) :** Le code est monolithique (`overlay.js`). Pour la maintenabilité, il faudrait idéalement séparer la logique WS de la logique UI.
*   **Configuration centralisée :** Les variables d'environnement sont parsées à plusieurs endroits. Une classe `Settings` (pydantic-settings) serait plus robuste.

## 4. Fonctionnalités Manquantes (vs PLAN.md)

1.  **Redis PubSub :** Prévu pour permettre le scaling horizontal, non implémenté.
2.  **Algorithm de Sync Avancé :** Le lissage (playbackRate) n'est pas implémenté (uniquement hard seek).
3.  **UI Jellyfin intégrée :** Le plugin sert les tokens mais n'injecte pas encore le script `overlay.js` dans l'interface web de Jellyfin automatiquement (nécessite un `IJavascriptEntryPoint` ou modification manuelle).

## 5. Plan d'Action Correctif

Nous allons procéder par ordre de priorité pour stabiliser le MVP.

### Étape 1 : Fixes Critiques (Stabilité)
1.  **[FAIT] Serveur :** Corriger la race condition dans `broadcast` (`app.py`).
2.  **[FAIT] Clients :** Suppression des clients MPV et VLC pour se concentrer sur le Web.
3.  **[FAIT] Infra :** Suppression de Redis (inutilisé).

### Étape 2 : Nettoyage & Infrastructure
1.  **[FAIT] Plugin Jellyfin :** Vérifier que `JwtSecret` a une valeur par défaut ou échoue gracieusement.

### Étape 3 : Amélioration du Code (Refactoring)
1.  **[FAIT] Serveur :** Introduire `TypedDict` pour les messages du protocole.
2.  **[FAIT] Serveur :** Refactorer la gestion des messages dans des handlers dédiés (RoomManager).

### Étape 4 : Features MVP manquantes
1.  **[FAIT] Web Overlay :** Améliorer le feedback visuel (latence, participants, reconnexion).

---

**Note :** Je suis prêt à exécuter l'**Étape 1** immédiatement.
