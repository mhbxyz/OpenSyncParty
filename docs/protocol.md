# Protocol Specification

OpenSyncParty uses a JSON-based protocol over WebSocket.

**Endpoint:** `ws://<server>/OpenSyncParty/ws`

## Message Format

All messages sent between client and server follow this structure:

```json
{
  "type": "message_type",
  "room": "room_id",
  "client": "client_id",
  "payload": { ... },
  "ts": 1678900000000,       // Client timestamp (ms)
  "server_ts": 1678900000100 // Server timestamp (added by server)
}
```

## Message Types

### Client -> Server

*   **`create_room`**:
    *   Payload:
        *   `media_url` (string): Identifier or URL of the media.
        *   `start_pos` (number): Initial position in seconds.
        *   `name` (string): Display name of the host.
        *   `options` (object): Room options (e.g., `free_play`).
    *   Response: `room_state`

*   **`join_room`**:
    *   Payload:
        *   `name` (string): Display name of the user.
        *   `auth_token` (string, optional): JWT for authentication.
        *   `invite_token` (string, optional): Token to join private rooms.
    *   Response: `room_state` (to joiner), `client_joined` (broadcast), `participants_update` (broadcast)

*   **`player_event`**:
    *   Payload:
        *   `action` (string): "play", "pause", or "seek".
        *   `position` (number): Current playback position in seconds.
    *   Behavior: Broadcasts the event to all other clients in the room.

*   **`state_update`**:
    *   Payload:
        *   `position` (number): Current position.
        *   `play_state` (string): "playing" or "paused".
    *   Behavior: Updates server state and broadcasts to others (typically sent periodically by host).

*   **`ping`**:
    *   Payload: `client_ts` (number).
    *   Response: `pong`

### Server -> Client

*   **`room_state`**:
    *   Payload: Full details of the room (host ID, media, current state, participants list). Sent on join/create.

*   **`client_joined`**:
    *   Payload: `name` of the new user.

*   **`client_left`**:
    *   Payload: empty.

*   **`participants_update`**:
    *   Payload: `participants` (array of objects), `participant_count` (number).

*   **`host_change`**:
    *   Payload: `host_id` (string).

*   **`player_event`**:
    *   Relayed from the host. Contains `action` and `position`.

*   **`state_update`**:
    *   Relayed from the host. Contains authoritative state.

*   **`pong`**:
    *   Payload: `client_ts` (echoed back for RTT calculation).

*   **`error`**:
    *   Payload: `code` (string), `message` (string).
