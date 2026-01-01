(() => {
  console.log("%c OpenSyncParty Plugin Loaded ", "background: #2e7d32; color: #fff; font-size: 12px; padding: 2px; border-radius: 2px;");
  const PANEL_ID = 'osp-watchparty-panel';
  const TOGGLE_ID = 'osp-watchparty-toggle';
  const STYLE_ID = 'osp-watchparty-style';
  
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const DEFAULT_WS_URL = `${protocol}//${host}/OpenSyncParty/ws`;
  const SUPPRESS_MS = 500;
  const RECONNECT_DELAY = 3000;

  const state = {
    ws: null,
    roomId: '',
    clientId: '',
    name: '',
    isHost: false,
    followHost: true,
    suppressUntil: 0,
    pingTimer: null,
    reconnectTimer: null,
    bound: false,
    autoReconnect: false
  };

  const nowMs = () => Date.now();
  const shouldSend = () => nowMs() > state.suppressUntil;
  const suppress = (ms = SUPPRESS_MS) => {
    state.suppressUntil = nowMs() + ms;
  };

  const getVideo = () => document.querySelector('video');

  const setStatus = (text, kind = 'info') => {
    const el = document.querySelector('.osp-status');
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  };

  const setLatency = (ms) => {
    const el = document.querySelector('.osp-latency');
    if (!el) return;
    el.textContent = ms === null ? '-' : `${ms} ms`;
  };

  const updateHostUI = (hostId) => {
    state.isHost = (hostId === state.clientId);
    const el = document.querySelector('.osp-host');
    if (el) {
      el.textContent = hostId || '-';
      el.style.color = state.isHost ? "#7dff98" : "#ccc";
    }
    const btn = document.querySelector('.osp-create');
    if (btn) btn.textContent = state.isHost ? "You are Host" : "Claim Host";
  };

  const send = (type, payload = {}) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({
      type,
      room: state.roomId,
      client: state.clientId,
      payload,
      ts: nowMs()
    }));
  };

  const handleMessage = (msg) => {
    const payload = msg.payload || {};
    const video = getVideo();

    switch (msg.type) {
      case "pong":
        if (payload.client_ts) {
          const rtt = nowMs() - payload.client_ts;
          setLatency(Math.max(0, Math.round(rtt)));
          if (state.isHost) {
            send("state_update", { position: video ? video.currentTime : 0, play_state: video && !video.paused ? "playing" : "paused" });
          }
        }
        break;

      case "invite_created":
        const inviteInput = document.querySelector('.osp-invite');
        if (inviteInput) inviteInput.value = payload.invite_token || '';
        break;

      case "room_state":
        updateHostUI(payload.host_id);
        if (payload.state && payload.state.play_state) {
          const ps = document.querySelector('.osp-playstate-text');
          if (ps) ps.textContent = payload.state.play_state;
        }
        if (payload.state && typeof payload.state.position === "number" && state.followHost && video) {
          if (Math.abs(video.currentTime - payload.state.position) > 1.5) {
            suppress();
            video.currentTime = payload.state.position;
          }
        }
        if (payload.participants) {
          updateParticipants(payload.participants, payload.participant_count);
        }
        break;

      case "host_change":
        updateHostUI(payload.host_id);
        break;

      case "player_event":
        if (!state.followHost || !video) return;
        suppress();
        if (payload.action === 'play') {
          video.play().catch(() => {});
        } else if (payload.action === 'pause') {
          video.pause();
        } else if (payload.action === 'seek' && typeof payload.position === 'number') {
          video.currentTime = payload.position;
        }
        break;

      case "state_update":
        if (!state.followHost || !video) return;
        if (typeof payload.position === "number") {
          if (Math.abs(video.currentTime - payload.position) > 2.0) {
            suppress();
            video.currentTime = payload.position;
          }
        }
        if (payload.play_state === "playing" && video.paused) {
          suppress();
          video.play().catch(() => {});
        } else if (payload.play_state === "paused" && !video.paused) {
          suppress();
          video.pause();
        }
        break;

      case "participants_update":
        updateParticipants(payload.participants, payload.participant_count);
        break;
        
      case "error":
        setStatus(`Error: ${payload.message || payload.code}`, 'error');
        break;
    }
  };

  const updateParticipants = (participants, count) => {
    const listEl = document.querySelector('.osp-participants-list');
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!Array.isArray(participants)) return;
    participants.forEach((p) => {
      const item = document.createElement("div");
      item.style.fontSize = "11px";
      item.style.padding = "2px 0";
      const label = p.name || p.client_id || "participant";
      item.textContent = p.is_host ? `👑 ${label}` : `👤 ${label}`;
      listEl.appendChild(item);
    });
  };

  const startPing = () => {
    stopPing();
    state.pingTimer = setInterval(() => {
      send('ping', { client_ts: nowMs() });
    }, 3000);
  };

  const stopPing = () => {
    if (state.pingTimer) {
      clearInterval(state.pingTimer);
      state.pingTimer = null;
    }
  };

  const connect = (isReconnect = false) => {
    const wsInput = document.querySelector('.osp-ws');
    const roomInput = document.querySelector('.osp-room');
    const nameInput = document.querySelector('.osp-name');

    if (!wsInput || !roomInput || !nameInput) return;
    state.roomId = roomInput.value.trim();
    state.name = nameInput.value.trim() || 'Guest';
    
    if (!state.roomId) {
      setStatus('Room ID required', 'error');
      return;
    }
    if (!state.clientId) {
      state.clientId = `client-${nowMs()}`;
    }

    setStatus(isReconnect ? 'Reconnecting...' : 'Connecting...');
    
    if (state.ws) state.ws.close();
    
    try {
      state.ws = new WebSocket(wsInput.value.trim() || DEFAULT_WS_URL);
    } catch (e) {
      setStatus('Invalid URL', 'error');
      return;
    }

    state.ws.addEventListener('open', () => {
      setStatus('Connected', 'ok');
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      startPing();
      if (isReconnect) {
        if (state.isHost) createRoom(); else joinRoom();
      }
    });

    state.ws.addEventListener('close', () => {
      setStatus('Disconnected', 'error');
      stopPing();
      if (state.autoReconnect) {
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(() => connect(true), RECONNECT_DELAY);
      }
    });

    state.ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || (msg.room && msg.room !== state.roomId)) return;
      handleMessage(msg);
    });
  };

  const createRoom = () => {
    state.isHost = true;
    state.followHost = false;
    const followToggle = document.querySelector('.osp-follow');
    if (followToggle) followToggle.checked = false;
    const video = getVideo();
    send('create_room', {
      media_url: video ? video.currentSrc : '',
      start_pos: video ? video.currentTime : 0,
      name: state.name,
      options: { free_play: false }
    });
  };

  const joinRoom = () => {
    state.isHost = false;
    state.followHost = true;
    const followToggle = document.querySelector('.osp-follow');
    if (followToggle) followToggle.checked = true;
    send('join_room', { name: state.name });
  };

  const createInvite = () => {
    send('create_invite', { expires_in: 3600 });
  };

  const bindVideo = () => {
    if (state.bound) return;
    const video = getVideo();
    if (!video) return;
    state.bound = true;

    const onEvent = (action) => {
      if (!state.isHost || !shouldSend()) return;
      send('player_event', { action, position: video.currentTime });
    };

    video.addEventListener('play', () => onEvent('play'));
    video.addEventListener('pause', () => onEvent('pause'));
    video.addEventListener('seeking', () => onEvent('seek'));
  };

  const createPanel = () => {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'hide';
    panel.innerHTML = `
      <div class="osp-title">OpenSyncParty</div>
      <input class="osp-input osp-ws" type="text" placeholder="WS URL" value="${DEFAULT_WS_URL}" />
      <input class="osp-input osp-room" type="text" placeholder="Room ID" />
      <input class="osp-input osp-name" type="text" placeholder="Your Name" />
      <div class="osp-row">
        <button class="osp-btn osp-connect">Connect</button>
        <button class="osp-btn osp-join">Join</button>
      </div>
      <button class="osp-btn osp-create" style="background:#1565c0">Start Room</button>
      <button class="osp-btn osp-invite-btn" style="background:#555">Get Invite</button>
      <input class="osp-input osp-invite" type="text" placeholder="Invite Code" readonly style="font-size:10px" />
      
      <label class="osp-toggle">
        <input class="osp-follow" type="checkbox" checked /> Follow host
      </label>
      <div class="osp-status" data-kind="info">Disconnected</div>
      <div class="osp-meta">Host: <span class="osp-host">-</span> | RTT: <span class="osp-latency">-</span></div>
      <div class="osp-participants-list" style="margin-top:8px; max-height:60px; overflow-y:auto; background:rgba(0,0,0,0.2); padding:4px"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.osp-connect').addEventListener('click', () => {
      state.autoReconnect = true;
      connect();
    });
    panel.querySelector('.osp-create').addEventListener('click', createRoom);
    panel.querySelector('.osp-join').addEventListener('click', joinRoom);
    panel.querySelector('.osp-invite-btn').addEventListener('click', createInvite);
    panel.querySelector('.osp-follow').addEventListener('change', (e) => {
      state.followHost = e.target.checked;
    });
  };

  const createToggle = () => {
    if (document.getElementById(TOGGLE_ID)) return;
    
    // Selectors for different Jellyfin/web versions
    const selectors = [
      '.videoOsdBottom .buttons',
      '.videoOsdBottom',
      '.btnVideoOsdSettings',
      'div[data-role="controlgroup"][data-type="horizontal"]'
    ];

    let target = null;
    for (const sel of selectors) {
      target = document.querySelector(sel);
      if (target) break;
    }

    if (!target) return;

    // Avoid injecting into settings menu itself if matched
    if (target.classList.contains('btnVideoOsdSettings')) {
        target = target.parentNode;
    }

    const btn = document.createElement('button');
    btn.id = TOGGLE_ID;
    btn.className = 'paper-icon-button-light btnWatchParty autoSize';
    btn.style.cssText = 'color: #fff; margin: 0 0.5em;';
    btn.setAttribute('title', 'Watch Party');
    btn.setAttribute('type', 'button');
    btn.innerHTML = '<span class="material-icons" aria-hidden="true" style="font-size: 1.8em;">group</span>';
    
    btn.addEventListener('click', () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
          panel.classList.toggle('hide');
          // Auto-focus input if opening
          if (!panel.classList.contains('hide')) {
              setTimeout(() => panel.querySelector('.osp-name').focus(), 100);
          }
      }
    });

    // Insert before settings or at the end
    const settingsBtn = target.querySelector('.btnVideoOsdSettings');
    if (settingsBtn) {
        target.insertBefore(btn, settingsBtn);
    } else {
        target.appendChild(btn);
    }
    
    console.log('[OpenSyncParty] Toggle button injected');
  };

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed; right: 20px; bottom: 100px; width: 260px; padding: 12px;
        border-radius: 12px; background: rgba(10, 10, 10, 0.95); color: #fff;
        font-family: inherit; z-index: 10000; border: 1px solid #333; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      }
      #${PANEL_ID}.hide { display: none; }
      #${PANEL_ID} .osp-title { font-weight: bold; margin-bottom: 10px; text-align: center; border-bottom: 1px solid #333; padding-bottom: 5px; }
      #${PANEL_ID} .osp-input {
        width: 100%; margin: 4px 0; padding: 6px 8px; border-radius: 4px;
        border: 1px solid #444; background: #000; color: #fff; box-sizing: border-box;
      }
      #${PANEL_ID} .osp-row { display: flex; gap: 6px; margin-top: 6px; }
      #${PANEL_ID} .osp-btn {
        flex: 1; border: none; border-radius: 4px; padding: 8px;
        background: #388e3c; color: #fff; cursor: pointer; font-weight: bold;
      }
      #${PANEL_ID} .osp-toggle { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; }
      #${PANEL_ID} .osp-status { margin-top: 8px; font-size: 11px; text-align: center; padding: 2px; border-radius: 3px; background: #222; }
      #${PANEL_ID} .osp-status[data-kind="ok"] { color: #69f0ae; }
      #${PANEL_ID} .osp-status[data-kind="error"] { color: #ff5252; }
      #${PANEL_ID} .osp-meta { margin-top: 6px; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
    `;
    document.head.appendChild(style);
  };

  const init = () => {
    createPanel();
    createToggle();
    injectStyles();
    bindVideo();
  };

  const observer = new MutationObserver(() => {
    init();
  });

  const start = () => {
    init();
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();