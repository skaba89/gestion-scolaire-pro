// ============================================================
// KILL OLD SERVICE WORKERS — runs BEFORE any app code.
// Removes leftover Workbox/PWA service workers from previous
// deployments that cause 'no-response' errors.
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    for (var i = 0; i < regs.length; i++) {
      regs[i].unregister();
    }
  });
  if (window.caches) {
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) { return caches.delete(n); }));
    });
  }
}
