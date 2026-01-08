(() => {
  if (window.OpenSyncParty && window.OpenSyncParty.__loaded) return;
  const OSP = window.OpenSyncParty = window.OpenSyncParty || {};
  OSP.__loaded = true;

  const currentScript = document.currentScript;
  let cacheBust = '';
  if (currentScript && currentScript.src) {
    try {
      const url = new URL(currentScript.src, window.location.href);
      cacheBust = url.searchParams.get('v') || '';
    } catch (err) {}
  }
  if (!cacheBust) cacheBust = String(Date.now());

  const base = '/web/plugins/opensyncparty';

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/${src}?v=${cacheBust}`;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  // Optimized parallel loading based on dependencies:
  // 1. state (no deps) → 2. utils (state) → 3. ui + playback (parallel) → 4. ws (ui) → 5. app (all)
  const loadAll = async () => {
    await loadScript('osp-state.js');
    await loadScript('osp-utils.js');
    await Promise.all([
      loadScript('osp-ui.js'),
      loadScript('osp-playback.js')
    ]);
    await loadScript('osp-ws.js');
    await loadScript('osp-app.js');
  };

  loadAll()
    .then(() => {
      if (window.OpenSyncParty && window.OpenSyncParty.app && typeof window.OpenSyncParty.app.init === 'function') {
        window.OpenSyncParty.app.init();
      }
    })
    .catch((err) => {
      console.error('[OpenSyncParty] Loader error:', err);
    });
})();
