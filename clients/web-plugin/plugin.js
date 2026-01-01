(() => {
  console.log("%c OpenSyncParty Plugin Loaded (Overlay Mode) ", "background: #2e7d32; color: #fff; font-size: 12px; padding: 2px; border-radius: 2px;");
  
  const PANEL_ID = 'osp-panel';
  const FLOATING_BTN_ID = 'osp-floating-btn';
  const STYLE_ID = 'osp-style';
  
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const DEFAULT_WS_URL = `${protocol}//${host}/OpenSyncParty/ws`;

  // --- STATE ---
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
    bound: false
  };

  const nowMs = () => Date.now();
  const shouldSend = () => nowMs() > state.suppressUntil;
  const suppress = (ms = 500) => state.suppressUntil = nowMs() + ms;
  const getVideo = () => document.querySelector('video');

  // --- UI ---

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${FLOATING_BTN_ID} {
        position: fixed; bottom: 80px; right: 20px; z-index: 20000;
        width: 48px; height: 48px; border-radius: 50%;
        background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255,255,255,0.1);
        color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5); transition: transform 0.2s, background 0.2s;
      }
      #${FLOATING_BTN_ID}:hover { background: rgba(60, 60, 60, 1); transform: scale(1.05); }
      #${FLOATING_BTN_ID}.hide { display: none; }
      
      #${PANEL_ID} {
        position: fixed; bottom: 140px; right: 20px; width: 280px; padding: 16px;
        border-radius: 12px; background: rgba(20, 20, 20, 0.95); backdrop-filter: blur(10px);
        color: #fff; font-family: inherit; z-index: 20000;
        border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        transform-origin: bottom right; transition: transform 0.2s, opacity 0.2s;
      }
      #${PANEL_ID}.hide { transform: scale(0.9); opacity: 0; pointer-events: none; }
      
      .osp-title { font-weight: bold; margin-bottom: 12px; font-size: 14px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; }
      .osp-input { width: 100%; margin: 6px 0; padding: 8px; border-radius: 6px; border: 1px solid #444; background: #111; color: #fff; box-sizing: border-box; font-size: 12px; }
      .osp-row { display: flex; gap: 8px; margin-top: 8px; }
      .osp-btn { flex: 1; border: none; border-radius: 6px; padding: 8px; background: #388e3c; color: #fff; cursor: pointer; font-weight: bold; font-size: 12px; }
      .osp-btn:hover { opacity: 0.9; }
      .osp-toggle { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; cursor: pointer; }
      .osp-status { margin-top: 8px; font-size: 11px; text-align: center; color: #aaa; }
      .osp-status[data-kind="ok"] { color: #69f0ae; }
      .osp-status[data-kind="error"] { color: #ff5252; }
    `;
    document.head.appendChild(style);
  };

  const createUI = () => {
    if (document.getElementById(PANEL_ID)) return;

    // Floating Toggle Button
    const btn = document.createElement('button');
    btn.id = FLOATING_BTN_ID;
    btn.className = 'hide'; // Hidden by default
    btn.title = "OpenSyncParty";
    btn.innerHTML = '<span class="material-icons" style="font-size: 24px;">group</span>';
    btn.onclick = () => {
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.classList.toggle('hide');
    };
    document.body.appendChild(btn);

    // Main Panel
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
      <button class="osp-btn osp-create" style="background:#1565c0; width:100%; margin-top:8px;">Start Room</button>
      <button class="osp-btn osp-invite-btn" style="background:#555; width:100%; margin-top:8px;">Get Invite</button>
      <input class="osp-input osp-invite" type="text" placeholder="Invite Code" readonly style="font-size:10px; opacity:0.7;" />
      
      <label class="osp-toggle"><input class="osp-follow" type="checkbox" checked /> Follow host</label>
      <div class="osp-status">Disconnected</div>
    `;
    document.body.appendChild(panel);

    // Events
    panel.querySelector('.osp-connect').onclick = () => connect(true);
    panel.querySelector('.osp-create').onclick = createRoom;
    panel.querySelector('.osp-join').onclick = joinRoom;
    panel.querySelector('.osp-invite-btn').onclick = createInvite;
    panel.querySelector('.osp-follow').onchange = (e) => state.followHost = e.target.checked;
  };

  // --- LOGIC ---

  const checkVideoPresence = () => {
    const video = getVideo();
    const btn = document.getElementById(FLOATING_BTN_ID);
    const panel = document.getElementById(PANEL_ID);
    
    if (video) {
        if (btn) btn.classList.remove('hide');
        if (!state.bound) bindVideo(video);
    } else {
        if (btn) btn.classList.add('hide');
        if (panel) panel.classList.add('hide'); // Hide panel if video leaves
        state.bound = false;
    }
  };

  const bindVideo = (video) => {
    state.bound = true;
    console.log('[OpenSyncParty] Hooked video events');
    
    const onEvent = (action) => {
      if (!state.isHost || !shouldSend()) return;
      send('player_event', { action, position: video.currentTime });
    };

    video.addEventListener('play', () => onEvent('play'));
    video.addEventListener('pause', () => onEvent('pause'));
    video.addEventListener('seeking', () => onEvent('seek'));
  };

  // --- WEBSOCKET --- (Simplified logic)
  const setStatus = (text, kind) => {
      const el = document.querySelector('.osp-status');
      if(el) { el.textContent = text; el.dataset.kind = kind; }
  };
  
  const send = (type, payload = {}) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({ type, room: state.roomId, client: state.clientId, payload, ts: nowMs() }));
  };

  const connect = (auto = false) => {
    // ... (Connection logic same as before) ...
    state.autoReconnect = auto;
    const wsInput = document.querySelector('.osp-ws');
    const roomInput = document.querySelector('.osp-room');
    const nameInput = document.querySelector('.osp-name');
    
    if (!wsInput) return;
    state.roomId = roomInput.value.trim();
    state.name = nameInput.value.trim() || 'Guest';
    if (!state.roomId) { setStatus('Room ID required', 'error'); return; }
    if (!state.clientId) state.clientId = `client-${nowMs()}`;

    setStatus('Connecting...');
    if (state.ws) state.ws.close();
    try { state.ws = new WebSocket(wsInput.value.trim()); } catch { setStatus('Invalid URL', 'error'); return; }

    state.ws.onopen = () => { setStatus('Connected', 'ok'); };
    state.ws.onclose = () => { 
        setStatus('Disconnected', 'error'); 
        if(state.autoReconnect) setTimeout(() => connect(true), 3000); 
    };
    state.ws.onmessage = (e) => {
        try { 
            const msg = JSON.parse(e.data);
            if(msg.room === state.roomId) handleMessage(msg);
        } catch {}
    };
  };

  const handleMessage = (msg) => {
      const video = getVideo();
      if(msg.type === 'room_state') {
          // Update UI state
          state.isHost = (msg.payload.host_id === state.clientId);
          const btn = document.querySelector('.osp-create');
          if(btn) btn.textContent = state.isHost ? "You are Host" : "Claim Host";
      }
      if(msg.type === 'invite_created') {
          const inv = document.querySelector('.osp-invite');
          if(inv) inv.value = msg.payload.invite_token;
      }
      if(video && state.followHost) {
          if (msg.type === 'player_event') {
              suppress();
              if(msg.payload.action === 'play') video.play().catch(()=>{});
              if(msg.payload.action === 'pause') video.pause();
              if(msg.payload.action === 'seek') video.currentTime = msg.payload.position;
          }
      }
  };

  const createRoom = () => {
      state.isHost = true; state.followHost = false;
      const v = getVideo();
      send('create_room', { media_url: '', start_pos: v?v.currentTime:0, name: state.name, options: {free_play:false} });
  };
  const joinRoom = () => {
      state.isHost = false; state.followHost = true;
      send('join_room', { name: state.name });
  };
  const createInvite = () => send('create_invite', {expires_in: 3600});

  // --- BOOTSTRAP ---
  const init = () => {
      injectStyles();
      createUI();
      // Check for video every second (simple and reliable)
      setInterval(checkVideoPresence, 1000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();