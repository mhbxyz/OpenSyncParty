# User Guide

## Installation

1.  Download the latest release of the OpenSyncParty plugin (DLL file).
2.  Copy the `OpenSyncParty.dll` and its dependencies to your Jellyfin plugins directory (e.g., `/var/lib/jellyfin/plugins/OpenSyncParty`).
3.  Restart your Jellyfin server.

## Configuration

1.  Go to the Jellyfin Dashboard.
2.  Click on **Plugins** in the sidebar.
3.  Click on **OpenSyncParty**.
4.  Configure the **JWT Secret**. This is a secret key used to sign authentication tokens. It should be a long, random string.
    *   **Note:** If you leave this empty, the plugin might disable authentication features or be insecure.
5.  Click **Save**.

## Usage

1.  Open Jellyfin in your web browser.
2.  Start playing a video.
3.  In the video player controls (bottom bar), you should see a new "Watch Party" icon (group of people).
4.  Click the icon to open the OpenSyncParty panel.
5.  **To Host a Party:**
    *   Enter a **Display Name**.
    *   Click **Start Room**.
    *   You are now the host. The video playback will be synchronized for all participants.
    *   Click **Get Invite** to generate a link or token to share with friends.
6.  **To Join a Party:**
    *   Enter the **Room ID** (provided by the host).
    *   Enter a **Display Name**.
    *   (Optional) Enter an **Invite Token** if required.
    *   Click **Join**.
    *   The video will automatically sync to the host's position.

## Features

*   **Synchronized Playback:** Play, pause, and seek actions are synchronized.
*   **Latency Compensation:** The player attempts to adjust for network latency.
*   **Host Management:** Only the host controls playback by default.
*   **Auto-reconnect:** The client attempts to reconnect if the connection is lost.
