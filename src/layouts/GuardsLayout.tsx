import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Pencil,
  Mail,
  Phone,
  IdCard,
  MapPin,
  ShieldCheck,
  ArrowRightLeft,
} from "lucide-react";

import guardsNav from "@/data/guards-nav.json";
import { Button } from "@/components/ui/button";
import { PromoteDialog } from "@/pages/admin/security-guards/components/PromoteDialog";
import { Avatar, StatusBadge, TabNav } from "@/components/kit";
import securityGuardService from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import { fileUrlFromFile } from "@/lib/fileUrl";
import GuardRatingLevel from "@/pages/admin/security-guards/GuardRatingLevel";
import guardRatingService from "@/lib/api/guardRatingService";

type Props = {
  navKey: string;
  title?: string;
  children: ReactNode;
};

// Guard nav ids kept out of the horizontal strip (stub / low-traffic sections).
// Mirrors the old sidebar's hidden set. Supervisors show all of their items.
const HIDDEN_GUARD_IDS = new Set([
  "disponibilidad",
  "indicadores-kpi",
  "recordatorios",
  "archivos",
  "conjunto-habilidades",
  "departamento",
  "configuracion",
]);

export default function GuardsLayout({ navKey, title, children }: Props) {
  const { t } = useTranslation();
  const cfg: any = (guardsNav as any)[navKey] || null;
  const { id } = useParams();
  // Diálogo de promoción. El id de la URL es el de la FICHA; el rol vive en la
  // membresía, así que hace falta el id de USUARIO — se guarda al cargar.
  const [promoverAbierto, setPromoverAbierto] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  /* ── ESTA PERSONA YA NO ES VIGILANTE ───────────────────────────────────────
     La ficha de vigilante NO se borra al ascender —el expediente de campo
     cuelga de ella— así que su url sigue resolviendo para siempre. Con el
     redirect de abajo el flujo normal ya no acaba aquí, pero un enlace viejo,
     un marcador o el botón «atrás» sí. Sin este aviso, esa pantalla presenta a
     un supervisor como si siguiera siendo vigilante, con pestañas que ya no le
     corresponden. */
  const [rolMovido, setRolMovido] = useState<string | null>(null);
  const isSupervisor = navKey === "supervisors";

  const [entity, setEntity] = useState<any>(null);
  const [rating, setRating] = useState<{
    average: number;
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
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
  }, [id, isSupervisor]);

  // Guard review level for the header (link → Reseñas tab).
  useEffect(() => {
    if (!id || isSupervisor) return;
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
  }, [id, isSupervisor]);

  const resolvePath = (path: string) =>
    id && path.includes(":id") ? path.replace(":id", id) : path;

  const allItems: any[] = (cfg?.sections || []).flatMap(
    (s: any) => s.items || [],
  );
  const items = allItems.filter(
    (it: any) => isSupervisor || !HIDDEN_GUARD_IDS.has(it.id),
  );

  const labelOf = (it: any) =>
    String(it.label || "").includes(".") ? t(it.label) : it.label;
  const activeItem =
    allItems.find((it: any) => location.pathname === resolvePath(it.path)) ||
    allItems.find((it: any) =>
      location.pathname.startsWith(resolvePath(it.path) + "/"),
    );

  const listPath = isSupervisor ? "/supervisors" : "/security-guards";
  const rootLabel = isSupervisor
    ? t("guards.nav.supervisorsRoot")
    : t("guards.list.title", "Vigilantes");
  const landingPath = isSupervisor
    ? `/supervisors/${id}/perfil`
    : `/guards/${id}/resumen`;
  const displayName =
    entity?.name || (title ? t(title) : cfg?.title ? t(cfg.title) : "—");

  const editTarget = isSupervisor
    ? `/supervisors/${id}/perfil`
    : `/security-guards/edit/${id}`;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-4">
      {/* Esta persona ya cambió de rol: su ficha de vigilante es historial.
          Se enseña ANTES de nada, porque lo primero que hay que saber al abrir
          esta pantalla es que lo que se ve ya no es su papel actual. */}
      {!isSupervisor && rolMovido && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="flex-1">
            {t(
              "guards.rolCambiado.aviso",
              "{{name}} ya no es vigilante: ahora es {{rol}}. Esta ficha se conserva con su historial de campo.",
              {
                name: displayName,
                rol:
                  rolMovido === "securitySupervisor"
                    ? t("roles.securitySupervisor", "Supervisor")
                    : rolMovido,
              },
            )}
          </span>
          {rolMovido === "securitySupervisor" && entity?.userId && (
            <Link
              className="shrink-0 font-semibold underline underline-offset-2"
              to={`/supervisors/${entity.userId}`}
            >
              {t("guards.rolCambiado.ir", "Ver su ficha de supervisor")}
            </Link>
          )}
        </div>
      )}

      {/* Breadcrumb: {Raíz} › {Nombre} › {Pestaña} */}
      <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="shrink-0 hover:text-primary" to={listPath}>
          {rootLabel}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {activeItem ? (
          <>
            <Link
              className="max-w-[180px] truncate hover:text-primary sm:max-w-[240px]"
              title={displayName}
              to={landingPath}
            >
              {displayName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0 font-medium text-foreground">
              {labelOf(activeItem)}
            </span>
          </>
        ) : (
          <span
            className="max-w-[220px] truncate font-medium text-foreground sm:max-w-[320px]"
            title={displayName}
          >
            {displayName}
          </span>
        )}
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar
              className="h-16 w-16 text-xl"
              name={displayName}
              size="lg"
              src={entity?.photo}
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                {displayName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                {isSupervisor ? (
                  <StatusBadge dot={false} tone="info">
                    {t("comun.supervisor")}
                  </StatusBadge>
                ) : (
                  <StatusBadge
                    dot={false}
                    tone={entity?.activated ? "ok" : "neutral"}
                  >
                    <ShieldCheck className="h-3 w-3" />{" "}
                    {entity?.activated
                      ? t("guards.profile.access.statusActive", "App activa")
                      : t(
                          "guards.profile.access.statusPending",
                          "App pendiente",
                        )}
                  </StatusBadge>
                )}
                <StatusBadge tone={entity?.onDuty ? "ok" : "neutral"}>
                  {entity?.onDuty ? "En servicio" : "Fuera de servicio"}
                </StatusBadge>
                {entity?.zone && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {entity.zone}
                  </span>
                )}
                {!isSupervisor && rating && (
                  <GuardRatingLevel
                    average={rating.average}
                    count={rating.count}
                    onClick={() => navigate(`/guards/${id}/reviews`)}
                  />
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                {entity?.code && (
                  <span className="inline-flex items-center gap-1.5">
                    <IdCard className="h-3.5 w-3.5" /> {entity.code}
                  </span>
                )}
                {entity?.email && (
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5" /> {entity.email}
                  </span>
                )}
                {entity?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {entity.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          {id && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(editTarget)}
              >
                <Pencil className="mr-1 h-4 w-4" /> {t("common.edit", "Editar")}
              </Button>
              {/* Promover / devolver al campo. Va junto a «Editar» porque es una
                  acción sobre la PERSONA, no sobre una de sus pestañas. */}
              {entity?.userId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPromoverAbierto(true)}
                >
                  <ArrowRightLeft className="mr-1 h-4 w-4" />{" "}
                  {t("guards.promote.button", "Cambiar de rol")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <PromoteDialog
        open={promoverAbierto}
        personName={entity?.name}
        userId={(entity as any)?.userId || null}
        onDone={(rolNuevo) => {
          /* ── ASCENDER TIENE QUE LLEVARTE A LA FICHA NUEVA ──────────────────
             Esto hacía `window.location.reload()`, que recarga la MISMA url. Y
             la url es la ficha de VIGILANTE desde donde se asciende, así que
             promover a alguien te devolvía al mismo sitio, mirándolo como
             vigilante — como si no hubiera pasado nada.

             La ficha de vigilante sigue existiendo A PROPÓSITO después del
             cambio (`cambioDeRolService` la conserva: el expediente de campo
             —fichajes, incidentes, rondas, licencias— cuelga de
             `securityGuards.id`, y borrarla dejaría ese historial huérfano y la
             promoción sin vuelta atrás). Lo que faltaba no era borrar nada:
             era IR a donde ahora vive la persona. */
          const userId = (entity as any)?.userId;

          if (rolNuevo === "securitySupervisor" && userId) {
            navigate(`/supervisors/${userId}`, { replace: true });
            return;
          }
          if (rolNuevo === "securityGuard" && userId) {
            navigate(`/security-guards/${userId}`, { replace: true });
            return;
          }
          // Rol que esta pantalla no sabe ubicar: recargar es mejor que dejar
          // datos viejos delante.
          window.location.reload();
        }}
        onOpenChange={setPromoverAbierto}
      />

      {/* Pestañas de la ficha — la pieza del kit, igual que en cliente y puesto. */}
      <TabNav
        items={items.map((it: any) => ({
          value: it.id,
          label: labelOf(it),
          to: resolvePath(it.path),
        }))}
        value={
          items.find((it: any) => {
            const path = resolvePath(it.path);

            return (
              location.pathname === path ||
              location.pathname.startsWith(path + "/")
            );
          })?.id ?? ""
        }
      />

      <div>{children}</div>
    </div>
  );
}
