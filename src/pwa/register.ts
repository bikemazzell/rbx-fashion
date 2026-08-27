export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }
  const scriptUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, document.baseURI);
  void navigator.serviceWorker
    .register(scriptUrl, { scope: import.meta.env.BASE_URL })
    .catch(() => {});
}
