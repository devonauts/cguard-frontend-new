import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * El país en el que opera la empresa que ha iniciado sesión.
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * Es la vara con la que se miden los formularios cuando el propio registro
 * todavía no dice de qué país es: qué documento pedir, cómo llamarlo y qué
 * forma esperar. Sin esto, el alta de cliente medía a todo el mundo con la
 * regla ecuatoriana — trece dígitos terminados en 001 debajo de una etiqueta
 * que decía «NIP firmy».
 *
 * ── POR QUÉ NO PIDE NADA A LA RED ──────────────────────────────────────────
 * `/auth/me` ya devuelve el tenant completo, `country` incluido, y el contexto
 * de sesión lo tiene en memoria desde el arranque. Añadir aquí una llamada a
 * `tenantService.findById` —que es lo que hace el perfil de empresa— pondría
 * una petición extra en CADA formulario que quiera saber el país, para un dato
 * que ya está cargado.
 *
 * Devuelve el NOMBRE del país tal como está guardado («México», «Deutschland»,
 * «Polska»); quien lo necesite en ISO usa `resolveCountryCode`, que entiende
 * las dos formas. Cadena vacía si no se sabe: los validadores tratan eso como
 * «ante la duda, se acepta», que es justo lo que debe pasar.
 */
export function usePaisDeLaEmpresa(): string {
  const { user } = useAuth() as { user: any };

  return useMemo(() => {
    if (!user) return '';

    // La misma forma de elegir tenant que usa `extractPermissionsFromUser`: el
    // de `localStorage` si está entre los del usuario, y si no el primero.
    let tenantId: string | null = null;
    try { tenantId = localStorage.getItem('tenantId'); } catch { /* sin storage */ }

    const lista: any[] = Array.isArray(user.tenants) ? user.tenants : [];
    let entrada: any = null;
    if (lista.length) {
      if (tenantId) {
        entrada = lista.find(
          (t: any) => t?.tenantId === tenantId || (t?.tenant && (t.tenant.id === tenantId || t.tenant.tenantId === tenantId)),
        );
      }
      if (!entrada) entrada = lista[0];
    }

    const tenant = entrada?.tenant ?? entrada ?? user.tenant ?? null;
    return (tenant?.country || '').toString().trim();
  }, [user]);
}

export default usePaisDeLaEmpresa;
