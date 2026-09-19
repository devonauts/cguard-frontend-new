import menu from "@/data/sidebar-menu.json";

/**
 * LA MIGA SALE DEL MENÚ, no de la URL ni de cada página.
 *
 * Antes la escribía a mano cada pantalla —51 copias de `items={[{label:
 * t("dashboard.title"), path: "/dashboard"}, …]}`— y pasaba lo que pasa siempre
 * con 51 copias de lo mismo: unas apuntaban a rutas que ya no existen
 * (`/admin/programmer/schedule` daba 404 desde Cobertura), otras llamaban a la
 * página por un nombre que el menú no usa (Puestos de servicio salía como
 * «Clientes»), y 87 pantallas no tenían ninguna.
 *
 * `sidebar-menu.json` ya sabe cómo se llama cada destino y dónde cuelga, y el
 * menú lateral lo traduce con `sidebar.<id>`. Usar esa misma fuente significa
 * que la miga no puede contradecir al menú: si mañana Cobertura se llama de otra
 * forma, cambia en los dos sitios a la vez o en ninguno.
 *
 * Devuelve CLAVES, no texto: quien pinta decide el idioma. El respaldo es el
 * `name` del JSON, igual que hace el menú.
 */
export type Miga = {
  /** Claves i18n a probar en orden; la primera con traducción gana. */
  claves: string[];
  /** Respaldo si ninguna clave está traducida. */
  respaldo: string;
  /** Destino. La última miga no lleva: es donde ya estamos. */
  path?: string;
};

type Sub = { id: string; name: string; path: string };
type Item = { id: string; name: string; path?: string; subItems?: Sub[] };

const ITEMS = menu as Item[];

/** ¿`ruta` cae dentro de `base`? `/clients` cubre `/clients/42`, no `/clientsX`. */
function cubre(base: string, ruta: string): boolean {
  return ruta === base || ruta.startsWith(base + "/");
}

export function migaDeRuta(pathname: string): Miga[] {
  const ruta = pathname.replace(/\/+$/, "") || "/";
  let mejor: Miga[] = [];
  let largo = -1;

  for (const item of ITEMS) {
    // Un destino de primer nivel: una sola miga.
    if (item.path && cubre(item.path, ruta) && item.path.length > largo) {
      largo = item.path.length;
      mejor = [
        {
          claves: [`sidebar.${item.id}.label`, `sidebar.${item.id}`],
          respaldo: item.name,
        },
      ];
    }

    for (const sub of item.subItems ?? []) {
      if (!cubre(sub.path, ruta) || sub.path.length <= largo) continue;
      largo = sub.path.length;
      /* El padre va PRIMERO y sin enlace cuando es sólo un desplegable del menú
         (Programador, Nómina…): no tiene página propia, así que enlazarlo sería
         prometer un sitio al que no se puede ir. */
      mejor = [
        {
          claves: [`sidebar.${item.id}.label`, `sidebar.${item.id}`],
          respaldo: item.name,
          path: item.path,
        },
        {
          /* `sidebar.<padre>.<hijo>` antes que `sidebar.<hijo>`: hay dos
             «guardias» en el menú —el del equipo y el de analíticas— y sólo la
             clave con el padre los distingue. Es el mismo orden que usa el
             menú lateral para elegir su etiqueta. */
          claves: [`sidebar.${item.id}.${sub.id}`, `sidebar.${sub.id}`],
          respaldo: sub.name,
        },
      ];
    }
  }

  return mejor;
}
