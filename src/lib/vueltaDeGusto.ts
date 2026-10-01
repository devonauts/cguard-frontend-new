/**
 * LA VUELTA DE GUSTO DENTRO DE LA VENTANITA (`?gusto=…&ventana=1`).
 *
 * Gusto rompe el vínculo entre la ventanita y la pestaña que la abrió
 * (Cross-Origin-Opener-Policy), así que esta página ya no puede hablar con
 * ella. Tampoco hace falta: el servidor ya avisó a la pestaña por el websocket
 * de la empresa (`gusto:conexion`). Aquí sólo queda cerrarse.
 *
 * Se atiende ANTES de montar el CRM: montar la aplicación entera para cerrar
 * una ventana era lo que se veía (el CRM completo dentro de la ventanita).
 * Si el navegador no deja cerrarla, se deja un mensaje corto en su idioma.
 */
const TEXTOS: Record<string, [string, string]> = {
  es: ["Listo", "Ya puedes cerrar esta ventana: tu pantalla del CRM se actualizó sola."],
  en: ["All set", "You can close this window: your CRM screen has already updated."],
  pt: ["Pronto", "Você já pode fechar esta janela: sua tela do CRM foi atualizada."],
  fr: ["C’est fait", "Vous pouvez fermer cette fenêtre : votre écran du CRM s’est mis à jour."],
  de: ["Fertig", "Sie können dieses Fenster schließen: Ihr CRM-Bildschirm wurde aktualisiert."],
  it: ["Fatto", "Puoi chiudere questa finestra: la schermata del CRM si è aggiornata."],
  nl: ["Klaar", "Je kunt dit venster sluiten: je CRM-scherm is bijgewerkt."],
  pl: ["Gotowe", "Możesz zamknąć to okno: ekran CRM został zaktualizowany."],
};

export function atenderVueltaDeGusto(): boolean {
  let q: URLSearchParams;

  try {
    q = new URLSearchParams(window.location.search);
  } catch {
    return false;
  }
  if (!q.get("gusto") || q.get("ventana") !== "1") return false;

  try {
    window.close();
  } catch {
    /* no la abrió un script a ojos del navegador: queda el mensaje */
  }
  const lang = String(localStorage.getItem("language") || navigator.language || "es").slice(0, 2);
  const [titulo, texto] = TEXTOS[lang] || TEXTOS.es;
  /* Directo en <body> y fijo a toda la ventana: dentro de #root heredaba sus
     estilos de maqueta y el mensaje salía repetido en mosaico. */
  const raiz = document.body;

  if (raiz) {
    raiz.innerHTML = "";
    raiz.style.margin = "0";
    const caja = document.createElement("div");

    caja.style.cssText =
      "position:fixed;inset:0;display:grid;place-items:center;padding:2rem;text-align:center;font:16px/1.5 system-ui,sans-serif;background:#0b0c0e;color:#e9eaee";
    const h = document.createElement("h1");

    h.textContent = titulo;
    h.style.cssText = "font-size:20px;margin:0 0 .5rem";
    const p = document.createElement("p");

    p.textContent = texto;
    p.style.cssText = "margin:0;opacity:.75;max-width:22rem";
    const interior = document.createElement("div");

    interior.append(h, p);
    caja.append(interior);
    raiz.append(caja);
  }

  return true;
}
