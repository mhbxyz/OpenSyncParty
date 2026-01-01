# Development Guide

## Prerequisites

*   **Docker** & **Docker Compose**: For running the development environment.
*   **Make**: For executing build commands.
*   **.NET 9.0 SDK** (Optional, but recommended for IDE support): The project targets .NET 9.0.

## Project Structure

*   `plugins/jellyfin/OpenSyncParty`: Source code for the C# plugin.
*   `clients/web-plugin`: Source code for the client-side JavaScript.
*   `infra/docker`: Docker Compose configuration for the dev stack.
*   `Makefile`: Main entry point for development tasks.

## Quick Start

1.  **Start the Stack**:
    This command starts Jellyfin and builds the plugin.
    ```bash
    make up
    ```
    *   Jellyfin will be available at `http://localhost:8096`.
    *   The plugin source code is mounted into the builder container.
    *   The web client code is mounted into the Jellyfin container.

2.  **Rebuild Plugin**:
    If you modify C# code, you need to rebuild the plugin and restart Jellyfin.
    ```bash
    make build-plugin
    docker compose -f infra/docker/docker-compose.yml restart jellyfin-dev
    ```
    *(Note: `make up` handles this automatically)*

3.  **Client-Side Changes**:
    If you modify `clients/web-plugin/opensyncparty.js`, simply refresh your browser. The file is mounted directly into the container.

4.  **Logs**:
    To see Jellyfin logs (including plugin logs):
    ```bash
    make logs
    ```

## Debugging

*   The plugin logs to the standard Jellyfin log. Look for lines starting with `[OpenSyncParty]`.
*   You can use `curl` to test the WebSocket endpoint:
    ```bash
    curl -I http://localhost:8096/OpenSyncParty/ws
    ```
    It should return `400 Bad Request` (because it expects a WS handshake), confirming the endpoint is active.

## Release Build

To create a release artifact:

1.  Run the build:
    ```bash
    make build-plugin
    ```
2.  The compiled DLLs are located in `plugins/jellyfin/OpenSyncParty/dist/`.
3.  Zip the contents of this directory to create a release package.
