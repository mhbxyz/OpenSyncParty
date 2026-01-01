# Architecture

OpenSyncParty is implemented as a server-side plugin for Jellyfin. It embeds all the necessary logic to manage watch parties, eliminating the need for a separate backend server.

## Components

### 1. Jellyfin Plugin (C#)

The core of the system is a .NET library that runs within the Jellyfin server process.

*   **Plugin Entry Point (`Plugin.cs`)**: Initializes the plugin and registers it with Jellyfin. It also holds the singleton instance of the `RoomManager`.
*   **Web API Controller (`OpenSyncPartyController.cs`)**: Exposes an HTTP endpoint (`/OpenSyncParty/ws`) that upgrades requests to WebSockets. It handles the message loop for connected clients.
*   **Room Manager (`RoomManager.cs`)**: A thread-safe manager (using `ConcurrentDictionary`) that maintains the state of active rooms and connected clients. It handles room creation, joining, leaving, and message broadcasting.
*   **Models (`Models.cs`)**: Defines the data structures for protocol messages (JSON payloads).

### 2. Web Client (JavaScript)

The client-side component is a JavaScript file (`opensyncparty.js`) injected into the Jellyfin web interface.

*   **Overlay UI**: Creates a floating panel over the video player for user interaction.
*   **WebSocket Client**: Connects to the plugin's WebSocket endpoint.
*   **Video Hook**: Intercepts HTML5 video events (`play`, `pause`, `seek`) and sends them to the server. Conversely, it applies events received from the server to the video element.
*   **Sync Logic**: Handles latency calculation (RTT) and smooth playback adjustments.

## Data Flow

1.  **Connection**: The browser loads the Jellyfin web UI. The `opensyncparty.js` script initializes and connects to `wss://<jellyfin-host>/OpenSyncParty/ws`.
2.  **Room Creation**: A user creates a room. The plugin allocates a `Room` object in memory.
3.  **Joining**: Other users join the room using its ID. The plugin adds them to the room's client list.
4.  **Event Propagation**:
    *   Host clicks "Pause".
    *   JS Client sends `player_event` (pause) to Plugin via WS.
    *   Plugin updates Room state and broadcasts `player_event` to all other clients in the room.
    *   Other JS Clients receive the event and pause their video player.

## Persistence

Currently, room state is **in-memory only**. If the Jellyfin server restarts, all active rooms are lost. Configuration (like JWT Secret) is persisted using Jellyfin's standard plugin configuration mechanism (XML).
