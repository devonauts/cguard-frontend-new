import { usePuede } from "@/hooks/usePuede";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { DataTable } from "@/components/table/DataTable";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronsUpDown,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  Trash2,
  CalendarOff,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Undo2,
} from "lucide-react";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatsStrip,
  Stagger,
  StatusBadge,
  EmptyState,
  Toolbar,
  Segmented,
  SearchInput,
} from "@/components/kit";
import timeOffRequestService, {
  buscarPuestos,
  ScheduleEffect,
  TimeOffRecord,
} from "@/lib/api/timeOffRequestService";
import { useEspacio } from "@/hooks/useEspacio";
import GuardTypeahead, { GuardPick } from "./GuardTypeahead";
import AusenciasCalendario from "./AusenciasCalendario";
import { rangoDelMes } from "./ausenciasCalendario";

import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  // startDate/endDate are DATEONLY strings: `new Date("2026-07-20")` is UTC
  // midnight, which rendered vacations one day EARLY for anyone west of UTC.
  // Anchor the calendar date locally instead.
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  return d.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── component ────────────────────────────────────────────────────────────────

export default function TimeOff() {
  const { t } = useTranslation();
  // Buttons follow the server's permissions (lib/reglasDeAcciones).
  const crear = usePuede("permisos.crear");
  const decidir = usePuede("permisos.decidir");
  const borrar = usePuede("permisos.borrar");
  const [records, setRecords] = useState<TimeOffRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "cancelled"
  >("all");
  /* Ausencias y permisos is the ONE place for every vacation and permit
     (the V/PM marks of Horario and Planificador land here too): a list and a
     month calendar, by person or by post, with the same filters. */
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calBy, setCalBy] = useState<"person" | "station">("person");
  const [month, setMonth] = useState(() => {
    const d = new Date();

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [typeFilter, setTypeFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState<GuardPick | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [puestos, setPuestos] = useState<Array<{ id: string; label: string }>>([]);
  const [picked, setPicked] = useState<TimeOffRecord | null>(null);
  const espacio = useEspacio();
  const sucursales = espacio.opciones.filter((o) => !o.global);

  useEffect(() => {
    buscarPuestos()
      .then(setPuestos)
      .catch(() => setPuestos([]));
  }, []);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // QA-85: the guard is picked with the server-side search (the old select
  // only ever held the first 200 guards) and it is required.
  const [guardPick, setGuardPick] = useState<GuardPick | null>(null);
  // Set synchronously: a double click must not send the request twice.
  const savingRef = useRef(false);

  // New Request Form
  const [form, setForm] = useState({
    guard: "",
    type: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    reason: "",
    comment: "",
    isPaid: false,
  });

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        limit: view === "calendar" ? 1000 : 500,
      };
      if (statusFilter !== "all") params["filter[status]"] = statusFilter;
      if (typeFilter !== "all") params["filter[type]"] = typeFilter;
      if (stationFilter !== "all") params["filter[stationId]"] = stationFilter;
      if (branchFilter !== "all") params["filter[branchId]"] = branchFilter;
      if (personFilter) params["filter[guardId]"] = personFilter.guardId;
      const rango =
        view === "calendar" ? rangoDelMes(month) : { from: dateFrom, to: dateTo };
      if (rango.from) params["filter[dateFrom]"] = rango.from;
      if (rango.to) params["filter[dateTo]"] = rango.to;
      const { rows } = await timeOffRequestService.list(params);
      setRecords(rows);
    } catch (err) {
      console.error("Failed to fetch time-off requests", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, stationFilter, branchFilter, personFilter, dateFrom, dateTo, view, month]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── derived ───────────────────────────────────────────────────────────────
  const stats = {
    pending: records.filter((r) => r.status === "pending").length,
    approved: records.filter((r) => r.status === "approved").length,
    rejected: records.filter((r) => r.status === "rejected").length,
  };

  const q = searchQuery.toLowerCase().trim();
  const filtered = records.filter((r) => {
    if (!q) return true;
    const guardName = r.guard?.fullName ?? "";
    return (
      guardName.toLowerCase().includes(q) ||
      (r.type ?? "").toLowerCase().includes(q) ||
      (r.reason ?? "").toLowerCase().includes(q)
    );
  });

  // Reparto de las solicitudes entre los tres estados, para que cada KPI diga
  // qué porción del total representa.
  const totalPermisos = stats.pending + stats.approved + stats.rejected;
  const pctPermisos = (n: number) =>
    totalPermisos > 0 ? Math.round((n / totalPermisos) * 100) : 0;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── handlers ──────────────────────────────────────────────────────────────
  const resetForm = () => {
    setGuardPick(null);
    setForm({
      guard: "",
      type: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      reason: "",
      comment: "",
      isPaid: false,
    });
  };

  const handleCreate = async () => {
    if (savingRef.current) return;
    if (!guardPick) {
      toast.error(
        t("ui.TimeOff.eligeAlVigilante", "Elige a quién corresponde el permiso."),
      );
      return;
    }
    if (!form.type || !form.startDate || !form.endDate || !form.reason) {
      toast.error(t("ui.TimeOff.faltanCamposTipoDesdeHasta"));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await timeOffRequestService.create({
        type: form.type,
        startDate: form.startDate,
        startTime: form.startTime || undefined,
        endDate: form.endDate,
        endTime: form.endTime || undefined,
        reason: form.reason,
        guard: guardPick.guardId,
        comment: form.comment || undefined,
        isPaid: form.isPaid,
      });
      await fetchRecords();
      setIsNewRequestOpen(false);
      resetForm();
    } catch (err) {
      console.error("Failed to create time-off request", err);
      toast.error(t("comun.errorAlCrearLaSolicitud"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /* What the decision did to the schedule, in words. Approving turns the
     person's shifts into gaps in Cobertura; undoing gives them back, except
     the days somebody already covered, the days of a closed pay period and
     the marks a person changed afterwards — those stay, and we say which. */
  const fechas = (dias?: string[]) =>
    (dias || []).map((d) => formatDate(d)).join(", ");
  const avisarEfecto = (e?: ScheduleEffect) => {
    if (!e || e.action === "none") return;
    if (e.action === "applied") {
      if (e.gapsOpened)
        toast.success(
          t("ui.TimeOff.aprobadoConHuecos", {
            n: e.gapsOpened,
            defaultValue:
              "Permiso aprobado. {{n}} turno(s) quedan como hueco en Cobertura para que alguien los cubra.",
          }),
        );
      else
        toast.success(
          t(
            "ui.TimeOff.aprobadoSinTurnos",
            "Permiso aprobado. No tenía turnos esos días.",
          ),
        );
      if (e.skippedPunched)
        toast.message(
          t("ui.TimeOff.turnosYaMarcados", {
            n: e.skippedPunched,
            defaultValue:
              "{{n}} turno(s) con entrada marcada se dejaron como trabajados.",
          }),
        );

      return;
    }
    if (e.legacy) {
      toast.message(
        t(
          "ui.TimeOff.aprobadoAntesSinRegistro",
          "Este permiso se aprobó antes de que el sistema guardara lo que cambiaba en el horario. Revisa sus días en el Horario y quita las marcas a mano.",
        ),
      );

      return;
    }
    toast.success(
      t("ui.TimeOff.turnosDevueltos", {
        n: e.restoredShifts || 0,
        defaultValue: "Listo. Se devolvieron {{n}} turno(s) al horario.",
      }),
    );
    if (e.coveredDays?.length)
      toast.message(
        t("ui.TimeOff.diasYaCubiertos", {
          dias: fechas(e.coveredDays),
          defaultValue:
            "Ya tenían reemplazo y se quedan como están: {{dias}}. Revísalos en Cobertura.",
        }),
      );
    if (e.closedDays?.length)
      toast.message(
        t("ui.TimeOff.diasCerrados", {
          dias: fechas(e.closedDays),
          defaultValue:
            "Son de un periodo de nómina cerrado y no se tocan: {{dias}}.",
        }),
      );
    if (e.editedDays?.length)
      toast.message(
        t("ui.TimeOff.diasCambiadosAMano", {
          dias: fechas(e.editedDays),
          defaultValue:
            "Alguien los cambió a mano después y se respetan: {{dias}}.",
        }),
      );
  };

  // Errors already reach the person as a toast from the API layer (with the
  // server's reason, e.g. a closed pay period).
  const cambiarEstado = async (
    id: string,
    status: "approved" | "rejected" | "cancelled",
  ) => {
    try {
      const updated = await timeOffRequestService.updateStatus(id, status);

      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updated, stations: r.stations } : r)),
      );
      setPicked(null);
      avisarEfecto(updated.scheduleEffect);
    } catch (err) {
      console.error(`Failed to set ${status}`, err);
    }
  };
  const handleApprove = (id: string) => cambiarEstado(id, "approved");
  const handleReject = (id: string) => cambiarEstado(id, "rejected");
  const handleCancel = async (id: string) => {
    if (
      !(await confirmDialog({
        title: t("ui.TimeOff.cancelarPermiso", "Cancelar el permiso"),
        message: t(
          "ui.TimeOff.cancelarPermisoMensaje",
          "Los turnos de esos días vuelven al horario y sus huecos en Cobertura se cierran. Los días que ya tienen reemplazo se quedan como están.",
        ),
        confirmText: t("ui.TimeOff.cancelarPermisoBoton", "Cancelar permiso"),
        cancelText: t("common.back", "Atrás"),
        tone: "danger",
      }))
    )
      return;
    await cambiarEstado(id, "cancelled");
  };

  const handleDelete = async (id: string) => {
    const aprobada = records.find((r) => r.id === id)?.status === "approved";

    if (
      !(await confirmDialog({
        title: t("ui.TimeOff.eliminarSolicitud", "Eliminar solicitud"),
        message: aprobada
          ? t(
              "ui.TimeOff.eliminarAprobada",
              "Se elimina la solicitud y se deshace lo que su aprobación cambió en el horario. Los días que ya tienen reemplazo se quedan como están.",
            )
          : t("ui.TimeOff.eliminarEstaSolicitud", "¿Eliminar esta solicitud?"),
        confirmText: t("common.delete", "Eliminar"),
        tone: "danger",
      }))
    )
      return;
    try {
      const r = await timeOffRequestService.destroy(id);

      setRecords((prev) => prev.filter((x) => x.id !== id));
      setPicked(null);
      avisarEfecto(r?.scheduleEffect);
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  /* The type is an API enum; only its label is translated. */
  const tipoLabel = (tipo: string | null | undefined): string => {
    switch (tipo) {
      case "vacation":
        return t("ui.TimeOff.vacaciones", "Vacaciones");
      case "sick":
        return t("ui.TimeOff.enfermedad", "Enfermedad");
      case "personal":
        return t("ui.TimeOff.personal", "Personal");
      case "training":
        return t("ui.TimeOff.capacitacion", "Capacitación");
      case "other":
        return t("ui.TimeOff.otro", "Otro");
      default:
        return tipo ?? "—";
    }
  };

  /* Where it was registered. Every screen lands here, so the list says which. */
  const origenLabel = (source: string | null | undefined): string => {
    switch (source) {
      case "app":
        return t("ui.TimeOff.origen.app", "App del vigilante");
      case "horario":
        return t("ui.TimeOff.origen.horario", "Horario");
      case "planificador":
        return t("ui.TimeOff.origen.planificador", "Planificador");
      case "editor":
        return t("ui.TimeOff.origen.editor", "Editor de horario");
      case "replacement":
        return t("ui.TimeOff.origen.replacement", "Reemplazo por vacaciones");
      case "vigia":
        return t("ui.TimeOff.origen.vigia", "Asistente");
      case "migrated":
        return t("ui.TimeOff.origen.migrated", "Registro anterior");
      default:
        return t("ui.TimeOff.origen.page", "Ausencias y permisos");
    }
  };

  /* The actions a row offers, by status and by what this person may do. */
  const accionesDe = (
    row: TimeOffRecord,
  ): Array<{ label: string; icon: ReactNode; onClick: () => void; destructive?: boolean }> => [
    ...(row.status === "pending" && decidir.puede
      ? [
          {
            label: t("ui.TimeOff.aprobar", "Aprobar"),
            icon: <CheckCircle style={{ color: "var(--ok-text)" }} />,
            onClick: () => handleApprove(row.id),
          },
          {
            label: t("ui.TimeOff.rechazar", "Rechazar"),
            icon: <XCircle style={{ color: "var(--bad-text)" }} />,
            onClick: () => handleReject(row.id),
          },
        ]
      : []),
    ...(row.status === "approved" && decidir.puede
      ? [
          {
            label: t("ui.TimeOff.cancelarPermisoBoton", "Cancelar permiso"),
            icon: <Undo2 />,
            onClick: () => handleCancel(row.id),
          },
        ]
      : []),
    ...(borrar.puede
      ? [
          {
            label: t("common.delete", "Eliminar"),
            icon: <Trash2 />,
            destructive: true,
            onClick: () => handleDelete(row.id),
          },
        ]
      : []),
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <StatusBadge tone="warn">{t("comun.pendiente")}</StatusBadge>;
      case "approved":
        return <StatusBadge tone="ok">{t("comun.aprobado")}</StatusBadge>;
      case "rejected":
        return <StatusBadge tone="bad">{t("comun.rechazado")}</StatusBadge>;
      case "cancelled":
        return (
          <StatusBadge tone="neutral">
            {t("ui.TimeOff.cancelado", "Cancelado")}
          </StatusBadge>
        );
      default:
        return <StatusBadge tone="neutral">{status}</StatusBadge>;
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<CalendarOff />}
          title={t("sidebar.personal.ausencias", "Ausencias y permisos")}
          subtitle={t("ui.TimeOff.solicitudesDeVacacionesEnfermedadY")}
        />

        {/* KPIs */}
        <StatsStrip className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label={t("ui.TimeOff.pendientes", "Pendientes")}
            value={stats.pending}
            icon={<Clock />}
            delta={
              totalPermisos > 0
                ? {
                    value: `${pctPermisos(stats.pending)} %`,
                    direction: stats.pending > 0 ? "up" : "flat",
                  }
                : undefined
            }
            hint={t("comun.esperandoUnaDecision")}
          />
          <MetricTile
            label={t("ui.TimeOff.aprobadas", "Aprobadas")}
            value={stats.approved}
            icon={<ThumbsUp />}
            delta={
              totalPermisos > 0
                ? { value: `${pctPermisos(stats.approved)} %`, direction: "up" }
                : undefined
            }
            hint={t("comun.delTotalDeSolicitudes")}
          />
          <MetricTile
            label={t("ui.TimeOff.rechazadas", "Rechazadas")}
            value={stats.rejected}
            icon={<ThumbsDown />}
            delta={
              totalPermisos > 0
                ? {
                    value: `${pctPermisos(stats.rejected)} %`,
                    direction: stats.rejected > 0 ? "down" : "flat",
                  }
                : undefined
            }
            hint={t("comun.delTotalDeSolicitudes")}
          />
        </StatsStrip>

        {/* Barra de filtros */}
        <Toolbar className="justify-between gap-4">
          {/* Elegir UNO de cuatro estados: el conmutador del sistema, no un
              desplegable. Muestra las cuatro opciones sin abrir nada. */}
          <Segmented<"all" | "pending" | "approved" | "rejected" | "cancelled">
            className="max-w-full"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: t("ui.TimeOff.todos", "Todos") },
              { value: "pending", label: t("comun.pendiente", "Pendiente") },
              { value: "approved", label: t("comun.aprobado", "Aprobado") },
              { value: "rejected", label: t("comun.rechazado", "Rechazado") },
              { value: "cancelled", label: t("ui.TimeOff.cancelado", "Cancelado") },
            ]}
          />

          <div className="flex w-full flex-col items-center gap-4 md:w-auto md:flex-row">
            <SearchInput
              className="w-full md:w-80"
              placeholder={t("ui.TimeOff.buscarVigilanteTipoOMotivo")}
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setPage(1);
              }}
            />

            <div className="flex items-center gap-2">
              {/* New Request Sheet */}
              {crear.puede && (
              <Sheet
                open={isNewRequestOpen}
                onOpenChange={(v) => {
                  setIsNewRequestOpen(v);
                  if (!v) resetForm();
                }}
              >
                <SheetTrigger asChild>
                  <Button variant="brand">
                    <Plus className="h-4 w-4 mr-1" />{" "}
                    {t("ui.TimeOff.nuevaEntrada", "Nueva entrada")}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[540px] overflow-y-auto">
                  <SheetHeader className="relative">
                    <SheetTitle>
                      {t("ui.TimeOff.nuevaSolicitudDeTiempoLibre")}
                    </SheetTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setIsNewRequestOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </SheetHeader>
                  <div className="grid gap-6 py-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>
                          {t("comun.vigilante")}
                          <span aria-hidden className="ml-0.5">*</span>
                        </Label>
                        <GuardTypeahead
                          value={guardPick}
                          onSelect={setGuardPick}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("ui.TimeOff.tipo")}</Label>
                        <Select
                          value={form.type}
                          /* Paid or not is the TYPE's for vacation, sickness and
                             training (the company decides in its pay rules);
                             only a personal permission asks. */
                          onValueChange={(v) => setForm({ ...form, type: v, isPaid: v === "personal" ? form.isPaid : true })}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("kit.select.placeholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vacation">
                              {tipoLabel("vacation")}
                            </SelectItem>
                            <SelectItem value="sick">
                              {tipoLabel("sick")}
                            </SelectItem>
                            <SelectItem value="personal">
                              {tipoLabel("personal")}
                            </SelectItem>
                            <SelectItem value="training">
                              {t("ui.TimeOff.capacitacion", "Capacitación")}
                            </SelectItem>
                            <SelectItem value="other">
                              {tipoLabel("other")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>{t("ui.TimeOff.desde")}</Label>
                        <Input
                          type="date"
                          value={form.startDate}
                          onChange={(e) =>
                            setForm({ ...form, startDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("comun.hora")}</Label>
                        <Input
                          type="time"
                          value={form.startTime}
                          onChange={(e) =>
                            setForm({ ...form, startTime: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>{t("ui.TimeOff.hasta")}</Label>
                        <Input
                          type="date"
                          value={form.endDate}
                          onChange={(e) =>
                            setForm({ ...form, endDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("comun.hora")}</Label>
                        <Input
                          type="time"
                          value={form.endTime}
                          onChange={(e) =>
                            setForm({ ...form, endTime: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>{t("ui.TimeOff.motivo")}</Label>
                      <Input
                        placeholder={t("ui.TimeOff.describeElMotivo")}
                        value={form.reason}
                        onChange={(e) =>
                          setForm({ ...form, reason: e.target.value })
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>{t("ui.TimeOff.comentario", "Comentario")}</Label>
                      <Textarea
                        rows={3}
                        value={form.comment}
                        onChange={(e) =>
                          setForm({ ...form, comment: e.target.value })
                        }
                        placeholder={t(
                          "ui.TimeOff.comentarioAdicional",
                          "Comentario adicional…",
                        )}
                      />
                    </div>

                    {form.type === "personal" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="isPaid"
                          checked={form.isPaid}
                          onCheckedChange={(v) =>
                            setForm({ ...form, isPaid: v as boolean })
                          }
                        />
                        <Label
                          htmlFor="isPaid"
                          className="text-sm font-normal cursor-pointer"
                        >
                          {t("ui.TimeOff.conGoceDeSueldo", "Con goce de sueldo (si no se marca, se descuenta)")}
                        </Label>
                      </div>
                    )}
                  </div>
                  <SheetFooter>
                    <Button
                      variant="brand"
                      className="w-full sm:w-auto"
                      disabled={saving}
                      onClick={handleCreate}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {t("ui.TimeOff.crearSolicitud", "Crear solicitud")}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
              )}
            </div>
          </div>
        </Toolbar>

        {/* Vista y filtros */}
        <Toolbar className="flex-wrap items-center gap-3">
          <Segmented<"list" | "calendar">
            value={view}
            onChange={(v) => {
              setView(v);
              setPage(1);
            }}
            options={[
              { value: "list", label: t("ui.TimeOff.vistaLista", "Lista") },
              { value: "calendar", label: t("ui.TimeOff.vistaCalendario", "Calendario") },
            ]}
          />
          {view === "calendar" && (
            <Segmented<"person" | "station">
              value={calBy}
              onChange={setCalBy}
              options={[
                { value: "person", label: t("ui.TimeOff.porPersona", "Por persona") },
                { value: "station", label: t("ui.TimeOff.porPuesto", "Por puesto") },
              ]}
            />
          )}
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label={t("ui.TimeOff.filtroTipo", "Tipo")}
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.TimeOff.todosLosTipos", "Todos los tipos")}</SelectItem>
              {(["vacation", "personal", "sick", "training", "other"] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  {tipoLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={stationFilter}
            onValueChange={(v) => {
              setStationFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label={t("ui.TimeOff.filtroPuesto", "Puesto")}
              className="w-full sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.TimeOff.todosLosPuestos", "Todos los puestos")}</SelectItem>
              {puestos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sucursales.length > 1 && (
            <Select
              value={branchFilter}
              onValueChange={(v) => {
                setBranchFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label={t("ui.TimeOff.filtroSucursal", "Sucursal")}
                className="w-full sm:w-48"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("ui.TimeOff.todasLasSucursales", "Todas las sucursales")}
                </SelectItem>
                {sucursales.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex w-full items-center gap-2 sm:w-64">
            <div className="min-w-0 flex-1">
              <GuardTypeahead
                value={personFilter}
                onSelect={(g) => {
                  setPersonFilter(g);
                  setPage(1);
                }}
              />
            </div>
            {personFilter && (
              <Button
                aria-label={t("ui.TimeOff.quitarFiltroPersona", "Quitar el filtro de persona")}
                size="icon"
                variant="ghost"
                onClick={() => setPersonFilter(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {view === "list" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input
                aria-label={t("ui.TimeOff.desde", "Desde")}
                className="w-full sm:w-40"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
              <span style={{ color: "var(--ink-soft)" }}>–</span>
              <Input
                aria-label={t("ui.TimeOff.hasta", "Hasta")}
                className="w-full sm:w-40"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
        </Toolbar>

        {view === "calendar" ? (
          <Section
            title={t("ui.TimeOff.calendario", "Calendario")}
            icon={<CalendarOff />}
          >
            <AusenciasCalendario
              by={calBy}
              month={month}
              records={records}
              typeLabel={tipoLabel}
              onMonth={setMonth}
              onPick={setPicked}
            />
          </Section>
        ) : (
        <>
        {/* Tabla */}
        <Section
          title={t(
            "ui.TimeOff.solicitudesDeTiempoLibre",
            "Solicitudes de tiempo libre",
          )}
          icon={<CalendarOff />}
          contentClassName="overflow-x-auto -mx-1"
        >
          {/* `DataTable` y no el primitivo `<Table>`: se pliega sola en fichas
              en el teléfono. El desplegable de la última columna era un
              `DropdownMenu` escrito a mano con las mismas tres opciones que
              `RowActionsMenu` ya sabe pintar — ahora va por `rowActions`, así
              que en la ficha aparece en la esquina como en el resto del CRM. */}
          <DataTable
            columns={[
              {
                key: "requestDate",
                header: t("comun.fechaDeSolicitud"),
                render: (_v: any, row: any) => formatDate(row.requestDate),
              },
              {
                key: "guardName",
                header: t("comun.vigilante"),
                titulo: true,
                render: (_v: any, row: any) =>
                  row.guard?.fullName ?? row.guardName ?? "—",
              },
              {
                key: "type",
                header: t("comun.tipo"),
                render: (_v: any, row: any) => (
                  <span className="capitalize">{tipoLabel(row.type)}</span>
                ),
              },
              {
                key: "startDate",
                header: t("comun.desde"),
                render: (_v: any, row: any) =>
                  row.startDate
                    ? `${row.startDate}${row.startTime ? " " + row.startTime : ""}`
                    : "—",
              },
              {
                key: "endDate",
                header: t("comun.hasta"),
                render: (_v: any, row: any) =>
                  row.endDate
                    ? `${row.endDate}${row.endTime ? " " + row.endTime : ""}`
                    : "—",
              },
              {
                key: "station",
                header: t("ui.TimeOff.puesto", "Puesto"),
                render: (_v: any, row: any) =>
                  (row.stations || []).map((x: any) => x.name).filter(Boolean).join(", ") || "—",
              },
              {
                key: "source",
                header: t("ui.TimeOff.origenColumna", "Registrado en"),
                render: (_v: any, row: any) => (
                  <span style={{ color: "var(--ink-soft)" }}>{origenLabel(row.source)}</span>
                ),
              },
              {
                key: "status",
                header: t("comun.estado"),
                render: (_v: any, row: any) => getStatusBadge(row.status),
              },
            ]}
            containerless
            data={paginated as any}
            emptyState={
              <EmptyState
                className="border-0 py-2"
                description={t("comun.noPudimosEncontrarNingunElemento")}
                icon={<CalendarOff />}
                title={t("kit.table.emptyTitle")}
              />
            }
            loading={loading}
            rowActions={(row: any) => accionesDe(row)}
          />
        </Section>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-2 py-4">
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.TimeOff.elementosPorPagina", "Elementos por página")}
          </div>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <div
            className="text-sm tabular-nums sm:mx-4"
            style={{ color: "var(--ink-soft)" }}
          >
            {filtered.length === 0
              ? t("ui.TimeOff.ceroDeCero", "0 de 0")
              : t("ui.TimeOff.rangoDePagina", {
                  defaultValue: "{{desde}}–{{hasta}} de {{total}}",
                  desde: (page - 1) * pageSize + 1,
                  hasta: Math.min(page * pageSize, filtered.length),
                  total: filtered.length,
                })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <span className="sr-only">
                {t("ui.TimeOff.paginaAnterior", "Página anterior")}
              </span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <span className="sr-only">
                {t("ui.TimeOff.paginaSiguiente", "Página siguiente")}
              </span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          </div>
        </div>
        </>
        )}

        {/* A leave picked on the calendar: what it is and what can be done. */}
        <Sheet open={!!picked} onOpenChange={(v) => !v && setPicked(null)}>
          <SheetContent className="w-full overflow-y-auto sm:w-[440px]">
            <SheetHeader>
              <SheetTitle>
                {picked?.guard?.fullName ?? picked?.guardName ?? "—"}
              </SheetTitle>
            </SheetHeader>
            {picked && (
              <div className="grid gap-3 py-4 text-sm" data-testid="ausencia-detalle">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tipoLabel(picked.type)}</span>
                  {getStatusBadge(picked.status)}
                </div>
                <div>
                  {formatDate(picked.startDate)} → {formatDate(picked.endDate ?? picked.startDate)}
                </div>
                {!!picked.stations?.length && (
                  <div style={{ color: "var(--ink-soft)" }}>
                    {picked.stations.map((x) => x.name).filter(Boolean).join(", ")}
                  </div>
                )}
                {picked.reason && <div>{picked.reason}</div>}
                <div style={{ color: "var(--ink-soft)" }}>
                  {t("ui.TimeOff.origenColumna", "Registrado en")}: {origenLabel(picked.source)}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {accionesDe(picked).map((a) => (
                    <Button
                      key={a.label}
                      variant={a.destructive ? "destructive" : "outline"}
                      onClick={a.onClick}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </PageContainer>
    </AppLayout>
  );
}
