/**
 * BLINDAJE CONTRA QUIEN TOCA EL DOM POR FUERA DE REACT
 *
 * Los traductores del navegador (Google Translate en Chrome, Safari, Edge) y
 * algunas extensiones reemplazan nodos de texto por <font> propios. Cuando React
 * después intenta quitar o insertar junto a un nodo que ya no es hijo de su padre,
 * el navegador lanza «Failed to execute 'removeChild'/'insertBefore' on 'Node'»
 * y toda la sección cae al error boundary. Le pasó a un prospecto al crear su
 * cuenta (2026-10-08).
 *
 * `translate="no"` en index.html evita la causa principal; esto es la red de
 * seguridad para lo que se cuele (extensiones, traducción forzada a mano): en vez
 * de lanzar, se ignora la operación imposible y se avisa en consola. Es el arreglo
 * conocido de facebook/react#11538.
 */
export function instalarBlindajeDom(): void {
  if (typeof Node !== "function" || !Node.prototype) return;
  const proto = Node.prototype as any;
  if (proto.__blindajeCguard) return;
  proto.__blindajeCguard = true;

  const quitar = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, hijo: T): T {
    if (hijo.parentNode !== this) {
      console.warn("[blindajeDom] removeChild de un nodo ajeno ignorado (¿traductor del navegador?)");
      return hijo;
    }
    return quitar.call(this, hijo);
  };

  const insertar = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, nuevo: T, referencia: Node | null): T {
    if (referencia && referencia.parentNode !== this) {
      console.warn("[blindajeDom] insertBefore con referencia ajena: se añade al final (¿traductor del navegador?)");
      return insertar.call(this, nuevo, null);
    }
    return insertar.call(this, nuevo, referencia);
  };
}
