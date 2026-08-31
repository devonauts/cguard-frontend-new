import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Envoltorio de un bloque de estación que MIDE su alto y lo deja apuntado.
 *
 * No decide nada: quién se pinta y quién no lo calcula la hoja a partir del
 * desplazamiento, igual que ya hacía con las columnas. Aquí sólo se guarda el
 * alto REAL para que el espaciador que ocupa su sitio no mienta — la primera
 * vez se parte de una estimación (medida: 86 px de cabecera + 48 px por plaza) y
 * a partir de ahí se usa el de verdad.
 *
 * ── POR QUÉ NO UN `IntersectionObserver` ───────────────────────────────────
 * La primera versión montaba los bloques con un observador y arrancaba en «no
 * pintar». Si el observador no dispara —y en el entorno de automatización con el
 * que se probó NO dispara, ni sobre `document.body`— la hoja se queda VACÍA: el
 * peor fallo posible, y silencioso. Con la aritmética del desplazamiento el peor
 * caso es pintar de más, que sólo cuesta tiempo. El respaldo de una optimización
 * tiene que ser «enséñalo todo», nunca «no enseñes nada».
 */
export default function BloqueVisible({
  id, alturas, children,
}: {
  id: string;
  /** Mapa compartido idEstación → alto real. Se escribe, no provoca repintado. */
  alturas: React.MutableRefObject<Map<string, number>>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && h > 0) alturas.current.set(id, h);
  });

  return <div ref={ref} id={`hs-${id}`}>{children}</div>;
}
