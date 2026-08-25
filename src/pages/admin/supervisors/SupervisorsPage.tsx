import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ShieldCheck, Plus, Radar, UserPlus, Car, MapPin, Users, Clock,
  LayoutGrid, List as ListIcon, Search, Mail, Phone,
  MoreVertical, Send, KeyRound, Eye, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PageContainer, PageHeader, Section, SkeletonCards, StatCard, StatusBadge, Modal, Stagger,
  GlassPanel, EmptyState, Segmented, Toolbar,
} from "@/components/kit";
import { supervisorService, type Supervisor } from "@/lib/api/supervisorService";
import { confirmDialog } from "@/components/ui/confirmDialog";

type StatFilter = "todos" | "enTurno" | "fuera" | "conVehiculo";

const WEEKDAYS = [
  { n: 1, label: "Lun" }, { n: 2, label: "Mar" }, { n: 3, label: "Mié" },
  { n: 4, label: "Jue" }, { n: 5, label: "Vie" }, { n: 6, label: "Sáb" }, { n: 0, label: "Dom" },
];

export default function SupervisorsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "", firstName: "", lastName: "", governmentId: "", phoneNumber: "", zone: "", assignedVehicle: "",
    turnoStart: "", turnoEnd: "",
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
  const [viewMode, setViewMode] = useState<"cards" | "list">(
    () => (localStorage.getItem("supervisors.viewMode") as "cards" | "list") || "cards",
  );
  useEffect(() => { localStorage.setItem("supervisors.viewMode", viewMode); }, [viewMode]);
  const [statFilter, setStatFilter] = useState<StatFilter>("todos");
  const [search, setSearch] = useState("");

  const onDuty = rows.filter((r) => r.isOnDuty).length;
  const offDuty = rows.length - onDuty;
  const withVehicle = rows.filter((r) => (r.assignedVehicle || "").trim()).length;

  const filtered = useMemo(() => {
    let list = rows;
    if (statFilter === "enTurno") list = list.filter((r) => r.isOnDuty);
    else if (statFilter === "fuera") list = list.filter((r) => !r.isOnDuty);
    else if (statFilter === "conVehiculo") list = list.filter((r) => (r.assignedVehicle || "").trim());
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        `${r.fullName || ""} ${r.zone || ""} ${r.email || ""} ${r.assignedVehicle || ""}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, statFilter, search]);

  // Clic en la MISMA tarjeta vuelve a "todos".
  const toggleStat = (f: StatFilter) => setStatFilter((prev) => (prev === f ? "todos" : f));

  const initialsOf = (name?: string) =>
    (name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

  const submit = async () => {
    if (!form.email.trim()) {
      toast.error("El correo es obligatorio");
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
        toast.success("Este correo ya tenía cuenta en CGuardPro: se le dio acceso a tu empresa. Entrará a la app con su contraseña actual.", { duration: 8000 });
      } else {
        toast.success("Supervisor creado y enviada la invitación");
      }
      setOpen(false);
      setForm({ email: "", firstName: "", lastName: "", governmentId: "", phoneNumber: "", zone: "", assignedVehicle: "", turnoStart: "", turnoEnd: "" });
      setTurnoDays([]);
      navigate(`/supervisors/${sup.id}`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo crear el supervisor");
    } finally {
      setSaving(false);
    }
  };

  // (Re)send the supervisor app-access invitation so they can create their account.
  const resendInvite = async (s: Supervisor) => {
    try {
      const r = await supervisorService.resendInvite(s.id);
      try { if (r?.link) await navigator.clipboard.writeText(r.link); } catch { /* clipboard optional */ }
      toast.success(r?.emailed ? "Acceso a la app enviado por correo y enlace copiado" : "Enlace de acceso copiado al portapapeles");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo enviar el acceso a la app");
    }
  };

  const sendPasswordReset = async (s: Supervisor) => {
    try {
      const r = await supervisorService.sendPasswordReset(s.id);
      try { if (r?.link) await navigator.clipboard.writeText(r.link); } catch { /* clipboard optional */ }
      const via = [r?.emailed && "correo", r?.pushed && "push"].filter(Boolean).join(" + ");
      toast.success(`Enlace de restablecimiento ${via ? `enviado por ${via} y ` : ""}copiado al portapapeles`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo restablecer la contraseña");
    }
  };

  // Remove a supervisor from this business (revokes access; account may live in other tenants).
  const removeSupervisor = async (s: Supervisor) => {
    const name = s.fullName || s.email || "este supervisor";
    if (!await confirmDialog({ message: `¿Eliminar a ${name}? Perderá el acceso a este negocio. Esta acción no se puede deshacer.`, tone: 'danger' })) return;
    try {
      await supervisorService.remove(s.id);
      toast.success("Supervisor eliminado");
      load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar el supervisor");
    }
  };

  // Per-row quick actions (3-dot menu) — shared by the list and cards views.
  const rowActions = (s: Supervisor) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Acciones" onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => navigate(`/supervisors/${s.id}`)}>
          <Eye className="mr-2 h-4 w-4" /> Ver detalles
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => resendInvite(s)}>
          <Send className="mr-2 h-4 w-4" /> Enviar acceso a la app
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => sendPasswordReset(s)}>
          <KeyRound className="mr-2 h-4 w-4" /> Restablecer contraseña
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => removeSupervisor(s)}
          style={{ color: "var(--bad-text)" }}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Eliminar supervisor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<Supervisor & { id: string }>[] = [
    { key: "fullName", header: "Nombre", render: (_v, r) => <span className="font-medium text-foreground">{r.fullName}</span> },
    { key: "zone", header: "Zona", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.zone || "—"}</span> },
    { key: "assignedVehicle", header: "Vehículo", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.assignedVehicle || "—"}</span> },
    {
      key: "isOnDuty", header: "Estado", render: (_v, r) =>
        r.isOnDuty
          ? <StatusBadge tone="ok">En turno</StatusBadge>
          : <StatusBadge tone="neutral" dot={false}>Fuera</StatusBadge>,
    },
    { key: "email", header: "Correo", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.email || "—"}</span> },
    { key: "actions", header: "", render: (_v, r) => <div className="text-right">{rowActions(r)}</div> },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PageContainer width="wide">
          <PageHeader
            icon={<ShieldCheck />}
            title="Supervisores"
            subtitle="Gestiona los supervisores de seguridad: perfil, zona, vehículo y estado en turno."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate("/supervisor-positions")}>
                  <MapPin className="mr-2 h-4 w-4" /> Puestos
                </Button>
                <Button variant="brand" onClick={() => setOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Nuevo supervisor
                </Button>
              </div>
            }
          />

          {/* Stats — clic en una tarjeta filtra la lista (clic de nuevo: todos) */}
          <Stagger className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { f: "todos" as StatFilter, label: "Supervisores", value: rows.length, icon: <Users />, accent: "brand" as const },
              { f: "enTurno" as StatFilter, label: "En turno", value: onDuty, icon: <Radar />, accent: "ok" as const },
              { f: "fuera" as StatFilter, label: "Fuera de turno", value: offDuty, icon: <Clock />, accent: "neutral" as const },
              { f: "conVehiculo" as StatFilter, label: "Con vehículo", value: withVehicle, icon: <Car />, accent: "warn" as const },
            ]).map((c) => (
              <button
                key={c.f}
                onClick={() => toggleStat(c.f)}
                title={statFilter === c.f && c.f !== "todos" ? "Quitar filtro" : "Filtrar la lista"}
                className="cg-focus rounded-3xl text-left transition-all"
                style={statFilter === c.f
                  ? { boxShadow: "0 0 0 2px var(--brand), 0 0 28px -8px var(--brand-glow)" }
                  : undefined}
              >
                <StatCard label={c.label} value={c.value} icon={c.icon} accent={c.accent} />
              </button>
            ))}
          </Stagger>

          <Section
            title="Supervisores"
            icon={<ShieldCheck />}
            action={
              <div className="flex items-center gap-2">
                <Toolbar className="hidden p-1 sm:flex">
                  <Search className="ml-1.5 h-4 w-4 shrink-0" style={{ color: "var(--ink-faint)" }} />
                  <Input
                    placeholder={t("ui.Supervisors.buscarPorNombreZonaVehiculo", "Buscar por nombre, zona, vehículo…")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-[240px] border-0 bg-transparent px-1 shadow-none"
                  />
                </Toolbar>
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: "cards", label: <span className="flex items-center gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Tarjetas</span> },
                    { value: "list", label: <span className="flex items-center gap-1.5"><ListIcon className="h-3.5 w-3.5" /> Lista</span> },
                  ]}
                />
              </div>
            }
          >
            {loading ? (
              <SkeletonCards count={4} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck />}
                title={rows.length === 0 ? "Aún no hay supervisores" : "Ningún supervisor coincide con el filtro"}
                description={rows.length === 0
                  ? "Los supervisores que des de alta aparecerán aquí con su zona, vehículo y estado en turno."
                  : "Prueba con otro texto de búsqueda o quita el filtro de las tarjetas de arriba."}
                action={rows.length === 0
                  ? <Button variant="brand" size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nuevo supervisor</Button>
                  : undefined}
              />
            ) : viewMode === "list" ? (
              <DataTable
                columns={columns}
                data={filtered as (Supervisor & { id: string })[]}
                onRowClick={(r) => navigate(`/supervisors/${r.id}`)}
                emptyState={<EmptyState icon={<ShieldCheck />} title={t("ui.Supervisors.aunNoHaySupervisores", "Aún no hay supervisores")} />}
              />
            ) : (
              <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((s) => (
                  <GlassPanel
                    key={s.id}
                    flat
                    hover
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/supervisors/${s.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/supervisors/${s.id}`); }}
                    className="cg-focus cursor-pointer p-4 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-sm font-bold"
                        style={{ background: "var(--brand-wash)", borderColor: "var(--brand-line)", color: "var(--brand-text)" }}
                      >
                        {initialsOf(s.fullName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-foreground">{s.fullName || "—"}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            {s.isOnDuty
                              ? <StatusBadge tone="ok">En turno</StatusBadge>
                              : <StatusBadge tone="neutral" dot={false}>Fuera</StatusBadge>}
                            {rowActions(s)}
                          </div>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{s.zone || "Sin zona asignada"}</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="mt-3 space-y-1.5 border-t pt-3 text-xs"
                      style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Car className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{s.assignedVehicle || "Sin vehículo"}</span>
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
        open={open}
        onOpenChange={setOpen}
        title="Nuevo supervisor"
        icon={<UserPlus className="h-5 w-5" />}
        description="Crea el usuario con rol de supervisor y su perfil. Se enviará una invitación."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="brand" onClick={submit} disabled={saving}>{saving ? "Creando…" : "Crear supervisor"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Correo *" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="sm:col-span-2" />
          <Input placeholder="Nombres" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          <Input placeholder="Apellidos" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          <Input placeholder={t("ui.Supervisors.cedulaId", "Cédula / ID")} value={form.governmentId} onChange={(e) => setForm((f) => ({ ...f, governmentId: e.target.value }))} />
          <Input placeholder={t("ui.Supervisors.telefono", "Teléfono")} value={form.phoneNumber} onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
          <Input placeholder={t("ui.Supervisors.zonaPosicionPEjAguila2", "Zona / posición (p. ej. Aguila2)")} value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
          <Input placeholder={t("ui.Supervisors.vehiculoAsignado", "Vehículo asignado")} value={form.assignedVehicle} onChange={(e) => setForm((f) => ({ ...f, assignedVehicle: e.target.value }))} />
        </div>

        <div className="glass-sunken mt-4 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">Turno del supervisor</p>
          <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.Supervisors.diasYHorarioQueEl", "Días y horario que el supervisor debe cumplir (opcional; también editable luego).")}</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = turnoDays.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => setTurnoDays((prev) => (prev.includes(d.n) ? prev.filter((x) => x !== d.n) : [...prev, d.n]))}
                  className="cg-focus rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all"
                  style={on
                    ? { background: "var(--brand)", color: "var(--brand-ink)", borderColor: "transparent", boxShadow: "0 0 18px -6px var(--brand-glow)" }
                    : { background: "transparent", color: "var(--ink-soft)", borderColor: "var(--hairline)" }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="cg-eyebrow">
              Entrada
              <Input type="time" value={form.turnoStart} onChange={(e) => setForm((f) => ({ ...f, turnoStart: e.target.value }))} className="mt-1" />
            </label>
            <label className="cg-eyebrow">
              Salida
              <Input type="time" value={form.turnoEnd} onChange={(e) => setForm((f) => ({ ...f, turnoEnd: e.target.value }))} className="mt-1" />
            </label>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
