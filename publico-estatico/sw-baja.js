/*
 * SERVICE WORKER DE BAJA (2026-10-25).
 *
 * nginx lo sirve en lugar de `/sw.js` a quien no tiene la cookie del código
 * (ver src/lib/sesionDeCodigo.ts). Un navegador que instaló el service worker
 * del CRM antes de que el código quedara detrás de la sesión lo recibe en su
 * siguiente comprobación de versión: se activa al momento, borra las cachés
 * del CRM, se da de baja y recarga las pestañas, que ya piden la página al
 * servidor (que decide qué aplicación servir).
 */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      try {
        var claves = await caches.keys();
        await Promise.all(claves.map(function (k) { return caches.delete(k); }));
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
      try {
        var ventanas = await self.clients.matchAll({ type: "window" });
        ventanas.forEach(function (c) {
          try { c.navigate(c.url); } catch (e) {}
        });
      } catch (e) {}
    })()
  );
});
