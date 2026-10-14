/* Hilo de guardia de la puerta anti-copia (src/lib/seguridad/puertaEnVivo.ts).
   Con las herramientas de desarrollador abiertas, el depurador se para aquí:
   el hilo deja de contestar y la página lo nota. Cerradas, no pasa nada. */
setInterval(function () {
  var t = Date.now();
  debugger;
  postMessage(Date.now() - t);
}, 500);
