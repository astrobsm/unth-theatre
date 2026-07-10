// Minimal preload. contextIsolation is on and nodeIntegration is off, so the
// loaded web app runs in a clean, secure context — identical to a browser.
// Nothing is exposed to the page; the desktop shell is a pure viewer of the
// live web app. Kept as a file so webPreferences.preload has a valid target.
window.addEventListener('DOMContentLoaded', () => {
  // Intentionally empty — reserved for future safe bridges if ever needed.
});
