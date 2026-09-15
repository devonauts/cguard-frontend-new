import { createContext, useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";

import securityGuardService from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import { fileUrlFromFile } from "@/lib/fileUrl";
import guardRatingService from "@/lib/api/guardRatingService";

/** Lo que la cabecera de la ficha necesita para pintarse. */
export interface DatosDeFicha {
  /** Nombre, foto, contacto y estado ya normalizados. `null` = cargando. */
  entity: any;
  /** Media de valoraciones del vigilante (los supervisores no tienen). */
  rating: { average: number; count: number } | null;
  /** Si la persona ya no es vigilante, el rol al que se movió. */
  rolMovido: string | null;
}

const FichaPersonaContext = createContext<DatosDeFicha | null>(null);

/**
 * El valor que puso la ruta padre, o `null` si no hay ninguna encima.
 * `GuardsLayout` usa ese `null` para decidir si tiene que pedir por su cuenta.
 */
export function useFichaPersona(): DatosDeFicha | null {
  return useContext(FichaPersonaContext);
}

/**
 * LA FICHA DE LA PERSONA (vigilante o supervisor), LEÍDA UNA SOLA VEZ.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 * La ficha del vigilante tiene 13 pestañas, y las 17 rutas `/guards/:id/*`
 * estaban declaradas como HERMANAS: cada click desmontaba `GuardsLayout` y
 * montaba otro, así que la cabecera volvía a pedir sus tres cosas —perfil,
 * valoración y rol— en cada pestaña. Medido en producción (auditoría
 * 2026-09-15): 13 x 3 = 39 peticiones para leer una sola ficha, 36 de ellas
 * relecturas de algo que no había cambiado.
 *
 * Ahora esto vive en la ruta PADRE (`FichaPersonaProvider`), que se queda
 * montada mientras se cambia de pestaña, y la cabecera lo consume por
 * contexto. Cambiar de pestaña ya no pide el perfil.
 *
 * El hook se queda exportado y con `activo` porque `GuardsLayout` lo usa
 * también como RESPALDO: si algún día alguien lo monta fuera de la ruta padre
 * —o desde otro sitio del CRM— sigue funcionando exactamente como antes, sólo
 * que pidiendo por su cuenta.
 */
export function useDatosDeFicha(
  id: string | undefined,
  isSupervisor: boolean,
  activo: boolean,
): DatosDeFicha {
  const [rolMovido, setRolMovido] = useState<string | null>(null);
  const [entity, setEntity] = useState<any>(null);
  const [rating, setRating] = useState<{
    average: number;
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!id || !activo) return;
    let mounted = true;

    (async () => {
      try {
        if (isSupervisor) {
          const s: any = await supervisorService.get(id);

          if (!mounted) return;
          setEntity({
            name:
              s.fullName ||
              `${s.firstName || ""} ${s.lastName || ""}`.trim() ||
              "Supervisor",
            photo: s.photoUrl || null,
            onDuty: !!s.isOnDuty,
            email: s.email,
            phone: s.phoneNumber,
            code: s.governmentId,
            role: "Supervisor",
            zone: s.zone,
            userId: s.userId || s.supervisorUserId || id,
          });
        } else {
          const d: any = await securityGuardService.get(id);

          if (!mounted) return;
          const g = d?.guard ?? d;
          const pi = d?.profileImage ?? g?.profileImage;
          const photoFile = Array.isArray(pi) ? pi[0] : pi;
          const photo =
            d?.photoUrl ?? g?.photoUrl ?? fileUrlFromFile(photoFile) ?? null;

          setEntity({
            name:
              g?.fullName ||
              `${g?.firstName || ""} ${g?.lastName || ""}`.trim() ||
              "Vigilante",
            photo,
            onDuty: !!g?.isOnDuty,
            activated: !!g?.hasPassword && g?.status === "active",
            email: g?.email,
            phone: g?.phoneNumber || g?.phone,
            code: d?.employeeCode || d?.guardNumber || g?.guardNumber || null,
            role: g?.role || null,
            userId: g?.guardId || d?.guardId || null,
          });

          /* Se pregunta por la membresía REAL, que es la que manda sobre qué
             app usa y qué ve. Se reutiliza el mismo endpoint del diálogo de
             cambio de rol en vez de engordar el payload de la ficha, que lo
             consumen muchas pantallas. Mejor esfuerzo: si falla, la cabecera
             simplemente no avisa. */
          const uid = g?.guardId || d?.guardId || null;

          if (uid) {
            try {
              const ro: any = await securityGuardService.roleOptions(uid);
              const actuales: string[] = (ro?.rolesActuales || []).map(String);

              if (
                mounted &&
                actuales.length > 0 &&
                !actuales.includes("securityGuard")
              ) {
                setRolMovido(actuales[0]);
              }
            } catch {
              /* sin aviso: no se pudo comprobar */
            }
          }
        }
      } catch {
        /* header stays sparse */
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, isSupervisor, activo]);

  // Guard review level for the header (link → Reseñas tab).
  useEffect(() => {
    if (!id || isSupervisor || !activo) return;
    let alive = true;

    guardRatingService
      .summary([id])
      .then((m) => {
        if (alive) setRating(m[id] || null);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [id, isSupervisor, activo]);

  return { entity, rating, rolMovido };
}

/**
 * Elemento de la ruta padre `/guards/:id` y `/supervisors/:id`.
 *
 * Lee la ficha una vez y la deja en contexto para todas las pestañas de
 * debajo, que se pintan en el `<Outlet/>`. No dibuja nada: el armazón y la
 * cabecera los sigue poniendo cada pestaña, que es lo que ya hacían.
 */
export function FichaPersonaProvider({
  isSupervisor = false,
}: {
  isSupervisor?: boolean;
}) {
  const { id } = useParams();
  const datos = useDatosDeFicha(id, isSupervisor, true);

  return (
    <FichaPersonaContext.Provider value={datos}>
      <Outlet />
    </FichaPersonaContext.Provider>
  );
}
