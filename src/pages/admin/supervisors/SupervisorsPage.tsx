import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Radar,
  UserPlus,
  Car,
  MapPin,
  Users,
  Clock,
  LayoutGrid,
  List as ListIcon,
  Search,
  Mail,
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
  Modal,
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

type StatFilter = "todos" | "enTurno" | "fuera" | "conVehiculo";

// Weekday labels are translated where they are painted (see WEEKDAYS.map below):
// this array is module-level, so a t() call here would freeze the boot language.
const WEEKDAYS = [
  { n: 1, labelKey: "comun.weekday.short.mon", label: "Lun" },
  { n: 2, labelKey: "comun.weekday.short.tue", label: "Mar" },
  { n: 3, labelKey: "comun.weekday.short.wed", label: "Mié" },
  { n: 4, labelKey: "comun.weekday.short.thu", label: "Jue" },
  { n: 5, labelKey: "comun.weekday.short.fri", label: "Vie" },
  { n: 6, labelKey: "comun.weekday.short.sat", label: "Sáb" },
  { n: 0, labelKey: "comun.weekday.short.sun", label: "Dom" },
];

export default function SupervisorsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    governmentId: "",
    phoneNumber: "",
    zone: "",
    assignedVehicle: "",
    turnoStart: "",
    turnoEnd: "",
  });
  const [turnoDays, setTurnoDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    supervisorService
      .list()
      .then((r) => setRows(r.rows || []))
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
        `${r.fullName || ""} ${r.zone || ""} ${r.email || ""} ${r.assignedVehicle || ""}`
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

  const submit = async () => {
    if (!form.email.trim()) {
      toast.error(t("ui.SupervisorsPage.elCorreoEsObligatorio"));

      return;
    }
    setSaving(true);
    try {
      const sup = await supervisorService.create({
        email: form.email.trim(),
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        governmentId: form.governmentId.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
        zone: form.zone.trim() || undefined,
        assignedVehicle: form.assignedVehicle.trim() || undefined,
        turnoDays: turnoDays.length ? turnoDays : undefined,
        turnoStart: form.turnoStart || undefined,
        turnoEnd: form.turnoEnd || undefined,
      });

      // Cuenta que ya existía (trabaja con otra empresa en CGuardPro): se ENLAZÓ,
      // no se creó — decir "invitación enviada" haría esperar un correo de
      // registro que no va a llegar (recibe uno de "te dieron acceso").
      if ((sup as any)?.linkedExistingAccount) {
        toast.success(t("ui.SupervisorsPage.esteCorreoYaTeniaCuenta"), {
          duration: 8000,
        });
      } else {
        toast.success(t("ui.SupervisorsPage.supervisorCreadoYEnviadaLa"));
      }
      setOpen(false);
      setForm({
        email: "",
        firstName: "",
        lastName: "",
        governmentId: "",
        phoneNumber: "",
        zone: "",
        assignedVehicle: "",
        turnoStart: "",
        turnoEnd: "",
      });
      setTurnoDays([]);
      navigate(`/supervisors/${sup.id}`);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "supervisors.errors.createFailed",
            "No se pudo crear el supervisor",
          ),
      );
    } finally {
      setSaving(false);
    }
  };

  // (Re)send the supervisor app-access invitation so they can create their account.
  const resendInvite = async (s: Supervisor) => {
    try {
      const r = await supervisorService.resendInvite(s.id);

      try {
        if (r?.link) await navigator.clipboard.writeText(r.link);
      } catch {
        /* clipboard optional */
      }
      toast.success(
        r?.emailed
          ? "Invitación reenviada por correo y enlace copiado"
          : "Enlace de invitación copiado al portapapeles",
      );
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

      try {
        if (r?.link) await navigator.clipboard.writeText(r.link);
      } catch {
        /* clipboard optional */
      }
      const via = [r?.emailed && "correo", r?.pushed && "push"]
        .filter(Boolean)
        .join(" + ");

      toast.success(
        `Enlace de restablecimiento ${via ? `enviado por ${via} y ` : ""}copiado al portapapeles`,
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
    const name = s.fullName || s.email || "este supervisor";

    if (
      !(await confirmDialog({
        message: `¿Eliminar a ${name}? Perderá el acceso a este negocio. Esta acción no se puede deshacer.`,
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
          aria-label="Acciones"
          size="icon"
          variant="ghost"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => navigate(`/supervisors/${s.id}`)}>
          <Eye className="mr-2 h-4 w-4" /> Ver detalles
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
          <Trash2 className="mr-2 h-4 w-4" /> Eliminar supervisor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<Supervisor & { id: string }>[] = [
    {
      key: "fullName",
      header: "Nombre",
      render: (_v, r) => (
        <span className="font-medium text-foreground">{r.fullName}</span>
      ),
    },
    {
      key: "zone",
      header: "Zona",
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.zone || "—"}
        </span>
      ),
    },
    {
      key: "assignedVehicle",
      header: "Vehículo",
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.assignedVehicle || "—"}
        </span>
      ),
    },
    {
      key: "isOnDuty",
      header: "Estado",
      render: (_v, r) =>
        r.isOnDuty ? (
          <StatusBadge tone="ok">{t("comun.enTurno")}</StatusBadge>
        ) : (
          <StatusBadge dot={false} tone="neutral">
            Fuera
          </StatusBadge>
        ),
    },
    {
      key: "email",
      header: "Correo",
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.email || "—"}
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
                <MapPin className="mr-2 h-4 w-4" /> Puestos
              </Button>
              <Button variant="brand" onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />{" "}
                {t("ui.SupervisorsPage.nuevoSupervisor")}{" "}
              </Button>
              </>
            }
            icon={<ShieldCheck />}
            subtitle={t(
              "ui.SupervisorsPage.gestionaLosSupervisoresDeSeguridad",
            )}
            title="Supervisores"
          />

          {/* Stats — clic en una tarjeta filtra la lista (clic de nuevo: todos) */}
          <Stagger className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                f: "todos" as StatFilter,
                label: "Supervisores",
                value: rows.length,
                icon: <Users />,
                accent: "brand" as const,
              },
              {
                f: "enTurno" as StatFilter,
                label: "En turno",
                value: onDuty,
                icon: <Radar />,
                accent: "ok" as const,
              },
              {
                f: "fuera" as StatFilter,
                label: "Fuera de turno",
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
                    ? "Quitar filtro"
                    : "Filtrar la lista"
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
                          <LayoutGrid className="h-3.5 w-3.5" /> Tarjetas
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
            title="Supervisores"
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
                      onClick={() => setOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />{" "}
                      {t("ui.SupervisorsPage.nuevoSupervisor")}
                    </Button>
                  ) : undefined
                }
                description={
                  rows.length === 0
                    ? "Los supervisores que des de alta aparecerán aquí con su zona, vehículo y estado en turno."
                    : "Prueba con otro texto de búsqueda o quita el filtro de las tarjetas de arriba."
                }
                icon={<ShieldCheck />}
                title={
                  rows.length === 0
                    ? t(
                        "ui.Supervisors.aunNoHaySupervisores",
                        "Aún no hay supervisores",
                      )
                    : "Ningún supervisor coincide con el filtro"
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
                                Fuera
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

      <Modal
        description={t("ui.SupervisorsPage.creaElUsuarioConRol")}
        footer={
          <>
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} variant="brand" onClick={submit}>
              {saving ? "Creando…" : "Crear supervisor"}
            </Button>
          </>
        }
        icon={<UserPlus className="h-5 w-5" />}
        open={open}
        title={t("ui.SupervisorsPage.nuevoSupervisor")}
        onOpenChange={setOpen}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            className="sm:col-span-2"
            placeholder={t("comun.correoReq")}
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            placeholder="Nombres"
            value={form.firstName}
            onChange={(e) =>
              setForm((f) => ({ ...f, firstName: e.target.value }))
            }
          />
          <Input
            placeholder="Apellidos"
            value={form.lastName}
            onChange={(e) =>
              setForm((f) => ({ ...f, lastName: e.target.value }))
            }
          />
          <Input
            placeholder={t("ui.Supervisors.cedulaId", "Cédula / ID")}
            value={form.governmentId}
            onChange={(e) =>
              setForm((f) => ({ ...f, governmentId: e.target.value }))
            }
          />
          <Input
            placeholder={t("ui.Supervisors.telefono", "Teléfono")}
            value={form.phoneNumber}
            onChange={(e) =>
              setForm((f) => ({ ...f, phoneNumber: e.target.value }))
            }
          />
          <Input
            placeholder={t(
              "ui.Supervisors.zonaPosicionPEjAguila2",
              "Zona / posición (p. ej. Aguila2)",
            )}
            value={form.zone}
            onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
          />
          <Input
            placeholder={t(
              "ui.Supervisors.vehiculoAsignado",
              "Vehículo asignado",
            )}
            value={form.assignedVehicle}
            onChange={(e) =>
              setForm((f) => ({ ...f, assignedVehicle: e.target.value }))
            }
          />
        </div>

        <div className="glass-sunken mt-4 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">
            {t("ui.SupervisorsPage.turnoDelSupervisor")}
          </p>
          <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.Supervisors.diasYHorarioQueEl",
              "Días y horario que el supervisor debe cumplir (opcional; también editable luego).",
            )}
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = turnoDays.includes(d.n);

              return (
                <button
                  key={d.n}
                  className="cg-focus rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all"
                  style={
                    on
                      ? {
                          background: "var(--brand)",
                          color: "var(--brand-ink)",
                          borderColor: "transparent",
                          boxShadow: "0 0 18px -6px var(--brand-glow)",
                        }
                      : {
                          background: "transparent",
                          color: "var(--ink-soft)",
                          borderColor: "var(--hairline)",
                        }
                  }
                  type="button"
                  onClick={() =>
                    setTurnoDays((prev) =>
                      prev.includes(d.n)
                        ? prev.filter((x) => x !== d.n)
                        : [...prev, d.n],
                    )
                  }
                >
                  {t(d.labelKey, d.label)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="cg-eyebrow">
              Entrada
              <Input
                className="mt-1"
                type="time"
                value={form.turnoStart}
                onChange={(e) =>
                  setForm((f) => ({ ...f, turnoStart: e.target.value }))
                }
              />
            </label>
            <label className="cg-eyebrow">
              Salida
              <Input
                className="mt-1"
                type="time"
                value={form.turnoEnd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, turnoEnd: e.target.value }))
                }
              />
            </label>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
