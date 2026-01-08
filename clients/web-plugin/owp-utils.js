(() => {
  const OWP = window.OpenWatchParty = window.OpenWatchParty || {};
  if (OWP.utils) return;

  const { SUPPRESS_MS, SYNC_LEAD_MS } = OWP.constants;
  const state = OWP.state;

  const nowMs = () => Date.now();
  const shouldSend = () => nowMs() > state.suppressUntil;
  const suppress = (ms = SUPPRESS_MS) => { state.suppressUntil = nowMs() + ms; };
  const getVideo = () => document.querySelector('video');
  const isVideoReady = () => {
    const video = getVideo();
    return video && video.readyState >= 3;
  };
  const isBuffering = () => {
    const video = getVideo();
    if (!video) return false;
    return video.readyState < 3 || (video.networkState === 2 && video.readyState < 4);
  };
  const isSeeking = () => {
    const video = getVideo();
    return video && video.seeking;
  };
  let syncingTimer = null;
  const startSyncing = () => {
    state.isSyncing = true;
    if (syncingTimer) clearTimeout(syncingTimer);
    syncingTimer = setTimeout(() => {
      state.isSyncing = false;
      syncingTimer = null;
    }, SUPPRESS_MS);
  };
  const getPlaybackManager = () => window.playbackManager || window.PlaybackManager || window.app?.playbackManager;
  const getCurrentItem = () => {
    const pm = getPlaybackManager();
    if (!pm) return null;
    if (typeof pm.getCurrentItem === 'function') return pm.getCurrentItem();
    if (typeof pm.currentItem === 'function') return pm.currentItem();
    return pm.currentItem || pm._currentItem || null;
  };
  /**
   * Gets the current item ID from playback manager or URL.
   * Jellyfin item IDs are 32 hex characters (fixes L13).
   */
  const getCurrentItemId = () => {
    // Prefer the playback manager as the authoritative source
    const item = getCurrentItem();
    if (item) return item.Id || item.id || item.ItemId || null;

    // Fallback: parse from URL hash (less reliable but works for direct links)
    const hash = window.location.hash || '';
    // Match various Jellyfin URL patterns: id=xxx, /items/xxx, /videos/xxx
    const patterns = [
      /[?&]id=([a-f0-9]{32})/i,           // Query param: ?id=xxx or &id=xxx
      /\/items\/([a-f0-9]{32})/i,         // Path: /items/xxx
      /\/videos\/([a-f0-9]{32})/i,        // Path: /videos/xxx
      /id=([a-f0-9]{32})/i                // Simple: id=xxx (legacy)
    ];
    for (const pattern of patterns) {
      const match = hash.match(pattern);
      if (match) return match[1];
    }
    return null;
  };
  const getItemImageUrl = (itemId) => {
    if (!itemId || !window.ApiClient || typeof ApiClient.getItemImageUrl !== 'function') return '';
    return ApiClient.getItemImageUrl(itemId, { type: 'Primary', quality: 90 });
  };
  const isHomeView = () => {
    if (document.querySelector('.homePage')) return true;
    const hash = window.location.hash || '';
    return hash.includes('home');
  };
  const getServerNow = () => nowMs() + (state.serverOffsetMs || 0);
  const adjustedPosition = (position, serverTs) => {
    const serverNow = getServerNow();
    const ts = typeof serverTs === 'number' ? serverTs : serverNow;
    const elapsed = Math.max(0, serverNow - ts) + SYNC_LEAD_MS;
    return position + (elapsed / 1000);
  };
  const scheduleAt = (serverTs, fn) => {
    if (state.pendingActionTimer) {
      clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
    }
    const serverNow = getServerNow();
    const target = typeof serverTs === 'number' ? serverTs : serverNow;
    const delay = Math.max(0, target - serverNow);
    if (delay === 0) {
      fn();
      return;
    }
    state.pendingActionTimer = setTimeout(() => {
      state.pendingActionTimer = null;
      fn();
    }, delay);
  };

  const escapeHtml = (str) => {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  /**
   * Structured debug logging for sync analysis.
   * Format: [OWP:{CATEGORY}] key=value key=value ...
   * Categories: CLOCK, HOST, CLIENT, SYNC, VIDEO
   * Logs are also forwarded to the session server via WebSocket.
   */
  const log = (category, data) => {
    const parts = Object.entries(data).map(([k, v]) => {
      if (typeof v === 'number') {
        // Format numbers: positions as Xs, timestamps as ms, rates as Xx
        if (k.includes('pos') || k === 'actual' || k === 'expected' || k === 'drift') {
          return `${k}=${v.toFixed(2)}s`;
        }
        if (k === 'rate') {
          return `${k}=${v.toFixed(2)}x`;
        }
        if (k.includes('offset') || k.includes('delay') || k.includes('rtt')) {
          return `${k}=${v >= 0 ? '+' : ''}${Math.round(v)}ms`;
        }
        return `${k}=${v}`;
      }
      return `${k}=${v}`;
    });
    const message = parts.join(' ');
    console.log(`[OWP:${category}] ${message}`);

    // Forward to session server via WebSocket (if connected)
    if (state.ws && state.ws.readyState === 1) {
      try {
        state.ws.send(JSON.stringify({
          type: 'client_log',
          payload: { category, message },
          ts: nowMs()
        }));
      } catch (e) {
        // Ignore send errors (connection may be closing)
      }
    }
  };

  OWP.utils = {
    nowMs,
    shouldSend,
    suppress,
    getVideo,
    isVideoReady,
    isBuffering,
    isSeeking,
    startSyncing,
    getPlaybackManager,
    getCurrentItem,
    getCurrentItemId,
    getItemImageUrl,
    isHomeView,
    getServerNow,
    adjustedPosition,
    scheduleAt,
    escapeHtml,
    log
  };
})();
