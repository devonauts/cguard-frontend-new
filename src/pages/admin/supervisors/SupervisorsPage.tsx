import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Radar,
  Car,
  MapPin,
  Users,
  Clock,
  LayoutGrid,
  List as ListIcon,
  Search,
  Mail,
  LogIn,
  Phone,
  MoreVertical,
  Send,
  KeyRound,
  Eye,
  Trash2,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatCard,
  StatusBadge,
  Stagger,
  GlassPanel,
  EmptyState,
  Segmented,
  Toolbar,
} from "@/components/kit";
import {
  supervisorService,
  type Supervisor,
} from "@/lib/api/supervisorService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useVistaGuardada } from "@/hooks/useVistaGuardada";
import { correoVisible } from "@/lib/correoVisible";
import { useCompartirAcceso } from "@/components/usuarioDeAcceso/CompartirAcceso";

type StatFilter = "todos" | "enTurno" | "fuera" | "conVehiculo";

export default function SupervisorsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  // «Usuario: jmiranda · comparte este enlace» (cuentas sin correo).
  const compartir = useCompartirAcceso();

  const load = useCallback(() => {
    setLoading(true);
    supervisorService
      .list()
      // Un correo inventado (cuenta sin buzón) no se enseña: queda en null.
      .then((r) =>
        setRows(
          (r.rows || []).map((s) => ({ ...s, email: correoVisible(s.email) })),
        ),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Vista tarjetas ⇄ lista (persistida) + filtro por tarjeta de estadística + búsqueda.
  const [viewMode, setViewMode] = useVistaGuardada<"cards" | "list">(
    "supervisors.viewMode",
    "cards",
  );

  const [statFilter, setStatFilter] = useState<StatFilter>("todos");
  const [search, setSearch] = useState("");

  const onDuty = rows.filter((r) => r.isOnDuty).length;
  const offDuty = rows.length - onDuty;
  const withVehicle = rows.filter((r) =>
    (r.assignedVehicle || "").trim(),
  ).length;

  const filtered = useMemo(() => {
    let list = rows;

    if (statFilter === "enTurno") list = list.filter((r) => r.isOnDuty);
    else if (statFilter === "fuera") list = list.filter((r) => !r.isOnDuty);
    else if (statFilter === "conVehiculo")
      list = list.filter((r) => (r.assignedVehicle || "").trim());
    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter((r) =>
        `${r.fullName || ""} ${r.zone || ""} ${r.email || ""} ${r.username || ""} ${r.assignedVehicle || ""}`
          .toLowerCase()
          .includes(q),
      );
    }

    return list;
  }, [rows, statFilter, search]);

  // Clic en la MISMA tarjeta vuelve a "todos".
  const toggleStat = (f: StatFilter) =>
    setStatFilter((prev) => (prev === f ? "todos" : f));

  const initialsOf = (name?: string) =>
    (name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();

  // (Re)send the supervisor app-access invitation so they can create their account.
  const resendInvite = async (s: Supervisor) => {
    try {
      const r = await supervisorService.resendInvite(s.id);
      const email = r?.email || s.email || "";

      // Sin buzón: no hay correo que mandar; el enlace se comparte en mano.
      if (!r?.email && r?.link) {
        compartir.abrir(
          [
            {
              nombre: s.fullName,
              username: r.username || s.username || null,
              link: r.link,
            },
          ],
          "invitacion",
        );

        return;
      }

      /* Se dice lo que PASÓ con el correo, sin copiar nada al portapapeles:
         «enlace copiado» al pedir un reenvío no tenía sentido (2026-10-08). */
      if (r?.emailed) {
        toast.success(
          t("ui.SupervisorsPage.invitacionReenviadaA", {
            email,
            defaultValue: "Invitación reenviada a {{email}}.",
          }),
        );
      } else if (r?.recentlySentAt) {
        /* El servidor no reenvía la misma invitación en 10 minutos: justo
           después de crearla, el correo ya salió y sólo hay que esperarlo. */
        const pasaron = Math.floor(
          (Date.now() - new Date(r.recentlySentAt).getTime()) / 60_000,
        );
        const faltan = Math.min(10, Math.max(1, 10 - pasaron));

        toast.info(
          t("ui.SupervisorsPage.invitacionYaEnviada", {
            email,
            faltan,
            defaultValue:
              "La invitación ya se envió a {{email}} hace unos minutos. Pídele que revise su bandeja de entrada y la carpeta de spam. Podrás reenviarla en {{faltan}} min.",
          }),
          { duration: 8000 },
        );
      } else {
        toast.error(
          t("ui.SupervisorsPage.invitacionNoSalio", {
            email,
            defaultValue:
              "No pudimos enviar el correo a {{email}}. Inténtalo de nuevo en unos minutos.",
          }),
        );
      }
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "supervisors.errors.resendInviteFailed",
            "No se pudo enviar el acceso a la app",
          ),
      );
    }
  };

  const sendPasswordReset = async (s: Supervisor) => {
    try {
      const r = await supervisorService.sendPasswordReset(s.id);

      // Sin buzón el servidor devuelve el enlace: es la única forma de dárselo.
      if (r?.link) {
        compartir.abrir(
          [
            {
              nombre: s.fullName,
              username: r.username || s.username || null,
              link: r.link,
            },
          ],
          "restablecer",
        );

        return;
      }

      const via = [
        r?.emailed && t("ui.SupervisorsPage.viaCorreo", "correo"),
        r?.pushed && t("ui.SupervisorsPage.viaPush", "push"),
      ]
        .filter(Boolean)
        .join(" + ");

      toast.success(
        via
          ? t("ui.SupervisorsPage.enlaceDeRestablecimientoEnviado", {
              via,
              defaultValue: "Enlace de restablecimiento enviado por {{via}}",
            })
          : t(
              "ui.SupervisorsPage.enlaceDeRestablecimientoCopiado",
              "No se pudo enviar el enlace: esta persona no tiene correo ni la app instalada",
            ),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "supervisors.errors.passwordResetFailed",
            "No se pudo restablecer la contraseña",
          ),
      );
    }
  };

  // Remove a supervisor from this business (revokes access; account may live in other tenants).
  const removeSupervisor = async (s: Supervisor) => {
    const name =
      s.fullName ||
      s.email ||
      t("ui.SupervisorsPage.esteSupervisor", "este supervisor");

    if (
      !(await confirmDialog({
        message: t("ui.SupervisorsPage.confirmarEliminar", {
          name,
          defaultValue:
            "¿Eliminar a {{name}}? Perderá el acceso a este negocio. Esta acción no se puede deshacer.",
        }),
        tone: "danger",
      }))
    )
      return;
    try {
      await supervisorService.remove(s.id);
      toast.success(t("ui.SupervisorsPage.supervisorEliminado"));
      load();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "supervisors.errors.removeFailed",
            "No se pudo eliminar el supervisor",
          ),
      );
    }
  };

  // Per-row quick actions (3-dot menu) — shared by the list and cards views.
  const rowActions = (s: Supervisor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("ui.SupervisorsPage.acciones", "Acciones")}
          size="icon"
          variant="ghost"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => navigate(`/supervisors/${s.id}`)}>
          <Eye className="mr-2 h-4 w-4" />{" "}
          {t("ui.SupervisorsPage.verDetalles", "Ver detalles")}
        </DropdownMenuItem>
        {/* «Enviar acceso a la app» describía el efecto pero no lo que es:
            quien la busca la busca como «reenviar la invitación», que es como
            se llama en la página de vigilantes y en el correo que recibe. */}
        <DropdownMenuItem onClick={() => resendInvite(s)}>
          <Send className="mr-2 h-4 w-4" />{" "}
          {t("guards.list.actions.resendInvite", "Reenviar invitación")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => sendPasswordReset(s)}>
          <KeyRound className="mr-2 h-4 w-4" />{" "}
          {t("guards.list.actions.resetPassword", "Restablecer contraseña")}
        </DropdownMenuItem>
        <DropdownMenuItem
          style={{ color: "var(--bad-text)" }}
          onClick={() => removeSupervisor(s)}
        >
          <Trash2 className="mr-2 h-4 w-4" />{" "}
          {t("ui.SupervisorsPage.eliminarSupervisor", "Eliminar supervisor")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<Supervisor & { id: string }>[] = [
    {
      key: "fullName",
      header: t("comun.nombre", "Nombre"),
      render: (_v, r) => (
        <span className="font-medium text-foreground">
          {r.fullName}
          {r.username && (
            <span
              className="block font-mono text-xs font-normal"
              style={{ color: "var(--ink-soft)" }}
              title={t("usuarioDeAcceso.etiqueta", "Usuario para entrar")}
            >
              {r.username}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "zone",
      header: t("ui.SupervisorCoveragePage.zona", "Zona"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.zone || "—"}
        </span>
      ),
    },
    {
      key: "assignedVehicle",
      header: t("ui.SupervisorsPage.vehiculo", "Vehículo"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.assignedVehicle || "—"}
        </span>
      ),
    },
    {
      key: "isOnDuty",
      header: t("comun.estado", "Estado"),
      render: (_v, r) =>
        r.isOnDuty ? (
          <StatusBadge tone="ok">{t("comun.enTurno")}</StatusBadge>
        ) : (
          <StatusBadge dot={false} tone="neutral">
            {t("ui.SupervisorsPage.fuera", "Fuera")}
          </StatusBadge>
        ),
    },
    {
      key: "email",
      header: t("comun.correo", "Correo"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.email || t("usuarioDeAcceso.sinCorreoCorto", "Sin correo")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_v, r) => <div className="text-right">{rowActions(r)}</div>,
    },
  ];

  return (
    <AppLayout>
      <div>
        <PageContainer width="wide">
          <PageHeader
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={() => navigate("/supervisor-positions")}
                >
                  <MapPin className="mr-2 h-4 w-4" />{" "}
                  {t("ui.SupervisorPositionsPage.puestos", "Puestos")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/personal/varias")}
                >
                  {t("agregarVarias.boton", "Agregar varias")}
                </Button>
                <Button
                  variant="brand"
                  onClick={() => navigate("/personal/nueva?tipo=supervisor")}
                >
                  <Plus className="mr-2 h-4 w-4" />{" "}
                  {t("ui.SupervisorsPage.nuevoSupervisor")}{" "}
                </Button>
              </>
            }
            icon={<ShieldCheck />}
            subtitle={t(
              "ui.SupervisorsPage.gestionaLosSupervisoresDeSeguridad",
            )}
            title={t("ui.SupervisorsPage.supervisores", "Supervisores")}
          />

          {/* Stats — clic en una tarjeta filtra la lista (clic de nuevo: todos) */}
          <Stagger className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                f: "todos" as StatFilter,
                label: t("ui.SupervisorsPage.supervisores", "Supervisores"),
                value: rows.length,
                icon: <Users />,
                accent: "brand" as const,
              },
              {
                f: "enTurno" as StatFilter,
                label: t("comun.enTurno", "En turno"),
                value: onDuty,
                icon: <Radar />,
                accent: "ok" as const,
              },
              {
                f: "fuera" as StatFilter,
                label: t("ui.SupervisorsPage.fueraDeTurno", "Fuera de turno"),
                value: offDuty,
                icon: <Clock />,
                accent: "neutral" as const,
              },
              {
                f: "conVehiculo" as StatFilter,
                label: t("supervisors.stats.withVehicle", "Con vehículo"),
                value: withVehicle,
                icon: <Car />,
                accent: "warn" as const,
              },
            ].map((c) => (
              <button
                key={c.f}
                className="cg-focus rounded-3xl text-left transition-all"
                style={
                  statFilter === c.f
                    ? {
                        boxShadow:
                          "0 0 0 2px var(--brand), 0 0 28px -8px var(--brand-glow)",
                      }
                    : undefined
                }
                title={
                  statFilter === c.f && c.f !== "todos"
                    ? t("ui.SupervisorsPage.quitarFiltro", "Quitar filtro")
                    : t("ui.SupervisorsPage.filtrarLaLista", "Filtrar la lista")
                }
                onClick={() => toggleStat(c.f)}
              >
                <StatCard
                  accent={c.accent}
                  icon={c.icon}
                  label={c.label}
                  value={c.value}
                />
              </button>
            ))}
          </Stagger>

          <Section
            action={
              <div className="flex items-center gap-2">
                <Toolbar className="hidden p-1 sm:flex">
                  <Search
                    className="ml-1.5 h-4 w-4 shrink-0"
                    style={{ color: "var(--ink-faint)" }}
                  />
                  <Input
                    className="h-8 w-[240px] border-0 bg-transparent px-1 shadow-none"
                    placeholder={t(
                      "ui.Supervisors.buscarPorNombreZonaVehiculo",
                      "Buscar por nombre, zona, vehículo…",
                    )}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Toolbar>
                <Segmented
                  options={[
                    {
                      value: "cards",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <LayoutGrid className="h-3.5 w-3.5" />{" "}
                          {t("ui.SupervisorsPage.tarjetas", "Tarjetas")}
                        </span>
                      ),
                    },
                    {
                      value: "list",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <ListIcon className="h-3.5 w-3.5" />{" "}
                          {t("comun.lista")}
                        </span>
                      ),
                    },
                  ]}
                  value={viewMode}
                  onChange={setViewMode}
                />
              </div>
            }
            icon={<ShieldCheck />}
            title={t("ui.SupervisorsPage.supervisores", "Supervisores")}
          >
            {loading ? (
              <SkeletonCards count={4} />
            ) : filtered.length === 0 ? (
              <EmptyState
                action={
                  rows.length === 0 ? (
                    <Button
                      size="sm"
                      variant="brand"
                      onClick={() =>
                        navigate("/personal/nueva?tipo=supervisor")
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />{" "}
                      {t("ui.SupervisorsPage.nuevoSupervisor")}
                    </Button>
                  ) : undefined
                }
                description={
                  rows.length === 0
                    ? t(
                        "ui.SupervisorsPage.losSupervisoresQueDesDeAlta",
                        "Los supervisores que des de alta aparecerán aquí con su zona, vehículo y estado en turno.",
                      )
                    : t(
                        "ui.SupervisorsPage.pruebaConOtroTextoDeBusqueda",
                        "Prueba con otro texto de búsqueda o quita el filtro de las tarjetas de arriba.",
                      )
                }
                icon={<ShieldCheck />}
                title={
                  rows.length === 0
                    ? t(
                        "ui.Supervisors.aunNoHaySupervisores",
                        "Aún no hay supervisores",
                      )
                    : t(
                        "ui.SupervisorsPage.ningunSupervisorCoincide",
                        "Ningún supervisor coincide con el filtro",
                      )
                }
              />
            ) : viewMode === "list" ? (
              <DataTable
                columns={columns}
                data={filtered as (Supervisor & { id: string })[]}
                emptyState={
                  <EmptyState
                    icon={<ShieldCheck />}
                    title={t(
                      "ui.Supervisors.aunNoHaySupervisores",
                      "Aún no hay supervisores",
                    )}
                  />
                }
                onRowClick={(r) => navigate(`/supervisors/${r.id}`)}
              />
            ) : (
              <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((s) => (
                  <GlassPanel
                    key={s.id}
                    flat
                    hover
                    className="cg-focus cursor-pointer p-4 text-left"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/supervisors/${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/supervisors/${s.id}`);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-sm font-bold"
                        style={{
                          background: "var(--brand-wash)",
                          borderColor: "var(--brand-line)",
                          color: "var(--brand-text)",
                        }}
                      >
                        {initialsOf(s.fullName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-foreground">
                            {s.fullName || "—"}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            {s.isOnDuty ? (
                              <StatusBadge tone="ok">
                                {t("comun.enTurno")}
                              </StatusBadge>
                            ) : (
                              <StatusBadge dot={false} tone="neutral">
                                {t("ui.SupervisorsPage.fuera", "Fuera")}
                              </StatusBadge>
                            )}
                            {rowActions(s)}
                          </div>
                        </div>
                        <div
                          className="mt-0.5 flex items-center gap-1.5 text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {s.zone ||
                              t("supervisors.card.noZone", "Sin zona asignada")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="mt-3 space-y-1.5 border-t pt-3 text-xs"
                      style={{
                        borderColor: "var(--hairline)",
                        color: "var(--ink-soft)",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Car className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {s.assignedVehicle ||
                            t("supervisors.card.noVehicle", "Sin vehículo")}
                        </span>
                      </div>
                      {s.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{s.email}</span>
                        </div>
                      )}
                      {s.username && (
                        <div
                          className="flex items-center gap-1.5"
                          title={t(
                            "usuarioDeAcceso.etiqueta",
                            "Usuario para entrar",
                          )}
                        >
                          <LogIn className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate font-mono">
                            {s.username}
                          </span>
                        </div>
                      )}
                      {s.phoneNumber && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{s.phoneNumber}</span>
                        </div>
                      )}
                    </div>
                  </GlassPanel>
                ))}
              </Stagger>
            )}
          </Section>
        </PageContainer>
      </div>

      {compartir.dialogo}
    </AppLayout>
  );
}
