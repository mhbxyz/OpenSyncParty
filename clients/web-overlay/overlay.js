(() => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const DEFAULT_WS_URL = `${protocol}//${host}/OpenSyncParty/ws`;
  const SUPPRESS_MS = 500;
  const RECONNECT_DELAY = 3000;

  const state = {
    ws: null,
    url: "",
    roomId: "",
    name: "",
    clientId: "",
    isHost: false,
    followHost: true,
    suppressUntil: 0,
    pingTimer: null,
    reconnectTimer: null,
    lastPingAt: 0,
    latency: null,
    video: null,
    autoReconnect: true,
  };

  const randomId = () => {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `client-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };

  const byId = (id) => document.getElementById(id);

  const setStatus = (text, kind = "info") => {
    const el = byId("osp-status");
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  };

  const setLatency = (ms) => {
    const el = byId("osp-latency");
    if (!el) return;
    el.textContent = ms === null ? "-" : `${ms} ms`;
    state.latency = ms;
  };

  const findVideo = () => {
    if (state.video && document.contains(state.video)) {
      return state.video;
    }
    state.video = document.querySelector("video");
    return state.video;
  };

  const shouldSend = () => Date.now() > state.suppressUntil;

  const suppressEvents = (ms = SUPPRESS_MS) => {
    state.suppressUntil = Date.now() + ms;
  };

  const sendMessage = (type, payload = {}) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const message = {
      type,
      room: state.roomId,
      client: state.clientId,
      payload,
      ts: Date.now(),
    };
    state.ws.send(JSON.stringify(message));
  };

  const connect = (isReconnect = false) => {
    if (state.ws) {
      state.ws.close();
    }

    state.url = byId("osp-ws").value.trim() || DEFAULT_WS_URL;
    state.roomId = byId("osp-room").value.trim();
    state.name = byId("osp-name").value.trim() || "Guest";

    if (!state.roomId) {
      setStatus("Room ID required", "error");
      return;
    }
    if (!state.clientId) {
      state.clientId = randomId();
    }

    setStatus(isReconnect ? "Reconnecting..." : "Connecting...");
    
    try {
      state.ws = new WebSocket(state.url);
    } catch (e) {
      setStatus("Invalid WS URL", "error");
      return;
    }

    state.ws.addEventListener("open", () => {
      setStatus("Connected", "ok");
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      startPing();
      
      // If we were host or joined, re-join/re-create
      if (isReconnect) {
        if (state.isHost) {
          createRoom(true);
        } else {
          joinRoom();
        }
      }
    });

    state.ws.addEventListener("close", () => {
      setStatus("Disconnected", "error");
      stopPing();
      setLatency(null);
      
      if (state.autoReconnect) {
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(() => connect(true), RECONNECT_DELAY);
      }
    });

    state.ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      if (!msg || (msg.room && msg.room !== state.roomId)) return;
      handleMessage(msg);
    });
  };

  const handleMessage = (msg) => {
    const payload = msg.payload || {};
    const video = findVideo();

    switch (msg.type) {
      case "pong":
        if (payload.client_ts) {
          const rtt = Date.now() - payload.client_ts;
          setLatency(Math.max(0, Math.round(rtt)));
          if (state.isHost) {
            sendMessage("state_update", { reported_latency: state.latency });
          }
        }
        break;

      case "invite_created":
        const inviteEl = byId("osp-invite");
        if (inviteEl) inviteEl.value = payload.invite_token || "";
        break;

      case "room_state":
        updateHostUI(payload.host_id);
        if (payload.state && payload.state.play_state) {
          byId("osp-playstate").textContent = payload.state.play_state;
        }
        if (payload.state && typeof payload.state.position === "number" && state.followHost) {
          if (video && Math.abs(video.currentTime - payload.state.position) > 1.0) {
            suppressEvents();
            video.currentTime = payload.state.position;
          }
        }
        if (payload.participants) {
          updateParticipants(payload.participants, payload.participant_count);
        }
        break;

      case "host_change":
        updateHostUI(payload.host_id);
        setStatus(`Host changed to ${payload.host_id}`, "info");
        break;

      case "player_event":
        if (!state.followHost || !video) return;
        const action = payload.action;
        suppressEvents();
        if (action === "play") {
          video.play().catch(() => {});
        } else if (action === "pause") {
          video.pause();
        } else if (action === "seek" && typeof payload.position === "number") {
          video.currentTime = payload.position;
        }
        break;

      case "state_update":
        if (!state.followHost || !video) return;
        if (typeof payload.position === "number") {
          if (Math.abs(video.currentTime - payload.position) > 2.0) {
            suppressEvents();
            video.currentTime = payload.position;
          }
        }
        if (payload.play_state === "playing" && video.paused) {
          suppressEvents();
          video.play().catch(() => {});
        } else if (payload.play_state === "paused" && !video.paused) {
          suppressEvents();
          video.pause();
        }
        break;

      case "participants_update":
        updateParticipants(payload.participants, payload.participant_count);
        break;
        
      case "error":
        setStatus(`Error: ${payload.message || payload.code}`, "error");
        break;
    }
  };

  const updateHostUI = (hostId) => {
    state.isHost = (hostId === state.clientId);
    byId("osp-host").textContent = hostId || "-";
    byId("osp-host").style.color = state.isHost ? "#7dff98" : "#ccc";
    
    const hostBtn = byId("osp-create");
    if (hostBtn) hostBtn.textContent = state.isHost ? "You are Host" : "Claim Host";
  };

  const updateParticipants = (participants, count) => {
    const countEl = byId("osp-count");
    const listEl = byId("osp-participants");
    if (countEl) countEl.textContent = Number.isFinite(count) ? String(count) : "-";
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!Array.isArray(participants)) return;
    participants.forEach((p) => {
      const item = document.createElement("div");
      item.style.padding = "2px 0";
      item.style.borderBottom = "1px solid #333";
      const label = p.name || p.client_id || "participant";
      item.textContent = p.is_host ? `👑 ${label}` : `👤 ${label}`;
      if (p.client_id === state.clientId) item.style.fontWeight = "bold";
      listEl.appendChild(item);
    });
  };

  const hookVideo = () => {
    const video = findVideo();
    if (!video) {
      setStatus("No video element found", "error");
      return;
    }
    
    const onEvent = (action) => {
      if (!state.isHost || !shouldSend()) return;
      sendMessage("player_event", { action, position: video.currentTime });
    };

    video.addEventListener("play", () => onEvent("play"));
    video.addEventListener("pause", () => onEvent("pause"));
    video.addEventListener("seeking", () => onEvent("seek"));
    
    // Periodically send state if host
    setInterval(() => {
      if (state.isHost && state.ws && state.ws.readyState === WebSocket.OPEN && !video.paused) {
        sendMessage("state_update", { 
          position: video.currentTime,
          play_state: "playing"
        });
      }
    }, 5000);
  };

  const startPing = () => {
    stopPing();
    state.pingTimer = window.setInterval(() => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      const clientTs = Date.now();
      state.lastPingAt = clientTs;
      sendMessage("ping", { client_ts: clientTs });
    }, 3000);
  };

  const stopPing = () => {
    if (state.pingTimer) {
      clearInterval(state.pingTimer);
      state.pingTimer = null;
    }
  };

  const createRoom = (silent = false) => {
    state.isHost = true;
    if (!silent) {
      state.followHost = false;
      byId("osp-follow").checked = false;
    }
    const video = findVideo();
    const mediaUrl = byId("osp-media").value.trim() || (video ? video.currentSrc : "");
    sendMessage("create_room", {
      media_url: mediaUrl,
      start_pos: video ? video.currentTime : 0,
      name: state.name,
      auth_token: byId("osp-auth").value.trim() || undefined,
      options: { free_play: false },
    });
  };

  const joinRoom = () => {
    state.isHost = false;
    state.followHost = true;
    byId("osp-follow").checked = true;
    sendMessage("join_room", {
      name: state.name,
      auth_token: byId("osp-auth").value.trim() || undefined,
      invite_token: byId("osp-invite").value.trim() || undefined,
    });
  };

  const createInvite = () => {
    sendMessage("create_invite", {
      expires_in: 3600,
      auth_token: byId("osp-auth").value.trim() || undefined,
    });
  };

  const createUI = () => {
    if (byId("osp-overlay")) return;
    const container = document.createElement("div");
    container.id = "osp-overlay";
    container.innerHTML = `
      <style>
        #osp-overlay {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 10000;
          background: rgba(15, 15, 15, 0.9);
          color: #eee;
          font: 12px/1.4 "Segoe UI", Roboto, Arial, sans-serif;
          padding: 14px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          width: 280px;
          border: 1px solid #333;
          backdrop-filter: blur(4px);
        }
        #osp-overlay input {
          width: 100%;
          margin: 4px 0;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #444;
          background: #000;
          color: #fff;
          box-sizing: border-box;
        }
        #osp-overlay button {
          width: 100%;
          margin-top: 8px;
          padding: 8px;
          border-radius: 6px;
          border: none;
          background: #388e3c;
          color: #fff;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.2s;
        }
        #osp-overlay button:hover { background: #43a047; }
        #osp-overlay button.secondary { background: #1976d2; }
        #osp-overlay button.secondary:hover { background: #1e88e5; }
        #osp-status { font-weight: bold; margin-bottom: 8px; padding: 4px 8px; border-radius: 4px; background: #222; text-align: center; }
        #osp-status[data-kind="error"] { color: #ff5252; background: #311; }
        #osp-status[data-kind="ok"] { color: #69f0ae; background: #121; }
        .osp-label { color: #888; font-size: 11px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .osp-row { display: flex; justify-content: space-between; margin-top: 4px; }
      </style>
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
        <span>OpenSyncParty</span>
        <span id="osp-latency" style="font-weight: normal; color: #888;">-</span>
      </div>
      <div id="osp-status" data-kind="info">Disconnected</div>
      
      <div class="osp-label">Connection</div>
      <input id="osp-ws" type="text" placeholder="WS URL" value="${DEFAULT_WS_URL}" />
      <input id="osp-room" type="text" placeholder="Room ID" />
      <input id="osp-name" type="text" placeholder="Your Name" />
      
      <div class="osp-label">Auth (Optional)</div>
      <input id="osp-auth" type="text" placeholder="JWT Token" />
      <input id="osp-invite" type="text" placeholder="Invite Token" />
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button id="osp-connect" class="secondary">Connect</button>
        <button id="osp-join">Join</button>
      </div>
      <button id="osp-create" class="secondary">Start Room (Host)</button>
      <button id="osp-invite-btn" style="background: #555;">Get Invite</button>
      
      <div class="osp-row" style="margin-top: 12px; align-items: center;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input id="osp-follow" type="checkbox" checked /> Follow Host
        </label>
        <span id="osp-playstate" style="background:#333; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; font-size: 10px;">paused</span>
      </div>

      <div class="osp-label">Room Info</div>
      <div class="osp-row">
        <span>Host:</span>
        <span id="osp-host" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis;">-</span>
      </div>
      <div class="osp-row">
        <span>Participants:</span>
        <span id="osp-count">0</span>
      </div>
      <div id="osp-participants" style="margin-top:8px; max-height:80px; overflow-y:auto; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 4px;"></div>
    `;
    document.body.appendChild(container);

    byId("osp-connect").addEventListener("click", () => {
      state.autoReconnect = true;
      connect();
      hookVideo();
    });
    byId("osp-create").addEventListener("click", () => createRoom());
    byId("osp-join").addEventListener("click", () => joinRoom());
    byId("osp-invite-btn").addEventListener("click", () => createInvite());
    byId("osp-follow").addEventListener("change", (e) => {
      state.followHost = e.target.checked;
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createUI);
  } else {
    createUI();
  }
})();