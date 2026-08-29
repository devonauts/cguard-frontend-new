# Traducción del CRM

`src/locales/<idioma>.json` — un diccionario por idioma, **7.828 claves cada uno**.
Sólo el español entra en el paquete de arranque; el resto se descarga cuando se
elige (ver `src/i18n.ts`).

## Cómo se hizo, y cómo repetirlo

1. Partir `es.json` en dos bloques equilibrados **sin partir ningún grupo**, y
   traducir cada bloque por separado. 7.828 claves de una sentada degradan la
   calidad.
2. **Dar al traductor las traducciones ya hechas de las apps móviles como ancla
   obligatoria** (`worker-app/` y `supervisor-app/src/i18n/locales/<idioma>.json`).
   Si la app dice `Rundgang`, el CRM no puede decir `Runde`: es la misma empresa
   mirando el mismo dato desde dos pantallas.
3. `check-bloques.py` — claves exactas, interpolaciones, ancho de rótulos.
4. `check-bloques-entre-si.py` — divergencias entre los dos bloques del mismo idioma.
5. `fusionar.py` — une A+B, valida contra `es.json` completo y **reconcilia** las
   palabras que salieron de dos formas.

## Lo que se aprendió (no volver a derivarlo)

- **La longitud no distingue rótulo de mensaje.** «Error al cargar clientes» es
  corto y aun así es un aviso con sitio de sobra. Lo dice el NOMBRE de la clave:
  `error/toast/hint/placeholder` = mensaje; `title/label/.actions./.tbl.` = rótulo.
- **`sidebar` NO es el menú**: son 1.888 claves con páginas enteras dentro.
- **Las interpolaciones se comparan como CONJUNTO.** Usar menos de las que pasa
  el código es legítimo (el neerlandés necesita un `{{plural}}` donde el español
  pone dos). Lo que rompe es INVENTAR una: sale literal en pantalla.
- **Partir en bloques obliga a reconciliar**: dos traductores traducen «Otro»
  como *Divers* y *Sonstiges*. `fusionar.py` unifica por mayoría, sólo en cadenas
  cortas; en los textos largos dos redacciones correctas no molestan.

## Pendiente

`src/config/permissionLabels.ts` — la matriz de permisos sólo existe en es/en/pt.
Los cinco idiomas europeos caen a INGLÉS (mejor que al español). Traducirla es
trabajo aparte.
