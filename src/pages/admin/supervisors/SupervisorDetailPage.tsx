import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarClock, Car, MapPin, Pencil, Check, IdCard, UserCog, Building2 } from "lucide-react";
import { Section, Field, EmptyState, SkeletonCards, PageContainer } from "@/components/kit";
import { supervisorService, type Supervisor } from "@/lib/api/supervisorService";
import { postSiteService } from "@/lib/api/postSiteService";
import userService from "@/lib/api/userService";
import { MultiSelectDeSedes } from "@/components/MultiSelectDeSedes";
import i18n from "@/i18n";

const WEEKDAYS = [
  { n: 1, label: "Lun" }, { n: 2, label: "Mar" }, { n: 3, label: "Mié" },
  { n: 4, label: "Jue" }, { n: 5, label: "Vie" }, { n: 6, label: "Sáb" }, { n: 0, label: "Dom" },
];

const FIELD_OPTIONS: Record<string, string[]> = {
  gender: ["Masculino", "Femenino"],
  bloodType: ["A+", "A-", "AB+", "AB-", "O+", "O-", "B+", "B-"],
  maritalStatus: ["Soltero", "Casado", "Unión libre", "Divorciado"],
  academicInstruction: ["Primaria", "Secundaria", "Universitaria", "Universidad", "Especial"],
};

function toDateInput(v: string | number | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function fmtDate(v: string | number | Date | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es");
}

/**
 * ── LAS SEDES DE ESTE SUPERVISOR ──────────────────────────────────────────
 *
 * Este control existía SÓLO en la ficha de usuarios de oficina, y a los
 * supervisores se les excluye de esa lista (`AdminOfficeUsersPage`) y se les
 * manda aquí — donde no estaba. Resultado medido en producción el 2026-08-26:
 * `tenant_user_post_sites` con CERO filas. No es que nadie lo hubiera hecho:
 * es que no se podía.
 *
 * Sin sedes asignadas, las listas del supervisor (excepciones de asistencia,
 * solicitudes de fichaje) no se pueden acotar a lo suyo — ve la operación
 * entera de la empresa. Marcar sedes aquí es lo que las acota.
 *
 * El backend ya lo aceptaba: `TenantUserRepository.updateRoles` persiste
 * `postSiteIds`, valida que sean del tenant y no mira el rol. Sólo faltaba
 * la pantalla.
 */
function SedesAsignadas({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [opciones, setOpciones] = useState<Array<{ id: string; name: string }>>([]);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [sedes, usuario] = await Promise.all([
          postSiteService.list({}, { limit: 500, offset: 0 }),
          userService.fetchUser(userId),
        ]);
        if (!vivo) return;
        setOpciones((sedes?.rows || []).map((s: any) => ({ id: String(s.id), name: s.name || s.companyName || s.businessName || "—" })));
        const u: any = (usuario as any)?.data ?? usuario;
        const crudas = u?.postSiteIds ?? u?.postSites ?? u?.assignedPostSites ?? [];
        setElegidas(Array.isArray(crudas) ? crudas.map((x: any) => String(x?.id ?? x)).filter(Boolean) : []);
      } catch {
        // Un fallo aquí no puede tumbar la ficha entera: la sección se queda
        // vacía y el resto del supervisor se sigue viendo.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [userId]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await userService.updateUser(userId, { postSiteIds: elegidas } as any);
      toast.success(t("ui.SupervisorDetail.sedesGuardadas", "Sedes guardadas"));
    } catch {
      toast.error(t("ui.SupervisorDetail.sedesError", "No se pudieron guardar las sedes"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Section title={t("ui.SupervisorDetail.sedesAsignadas", "Sedes asignadas")} icon={<Building2 />}>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
        Limita lo que este supervisor ve en su app: excepciones de asistencia y solicitudes de fichaje.
      </p>
      {cargando ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Cargando…</p>
      ) : (
        <>
          <MultiSelectDeSedes
            value={elegidas}
            onChange={setElegidas}
            options={opciones}
            placeholder={t("comun.elegirSedes", "Elegir sedes")}
          />
          {elegidas.length === 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              Sin ninguna sede marcada seguirá viendo TODO.
            </p>
          )}
          <Button className="mt-3" size="sm" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar sedes"}
          </Button>
        </>
      )}
    </Section>
  );
}

// ── Campos de edición — mismo lenguaje que la ficha del vigilante ───────────
const ReadField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Field label={label} value={value} />
);
const EditText = ({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <div>
    <div className="cg-eyebrow mb-1">{label}</div>
    <Input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
  </div>
);
const EditSelect = ({ label, value, field, onChange }: { label: string; value: string; field: string; onChange: (v: string) => void }) => (
  <div>
    <div className="cg-eyebrow mb-1">{label}</div>
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="cg-input cg-focus flex h-9 w-full px-2 text-sm">
      <option value="">{i18n.t('comun.seleccionar')}</option>
      {(FIELD_OPTIONS[field] || []).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export default function SupervisorDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [sup, setSup] = useState<Supervisor | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const hydrate = (s: Supervisor) => {
    setSup(s);
    setForm({
      governmentId: s.governmentId ?? "", birthDate: toDateInput(s.birthDate), birthPlace: s.birthPlace ?? "",
      address: s.address ?? "", gender: s.gender ?? "", bloodType: s.bloodType ?? "", maritalStatus: s.maritalStatus ?? "",
      academicInstruction: s.academicInstruction ?? "", guardCredentials: s.guardCredentials ?? "",
      hiringContractDate: toDateInput(s.hiringContractDate), zone: s.zone ?? "", assignedVehicle: s.assignedVehicle ?? "",
    });
  };

  const load = useCallback(() => {
    setLoading(true);
    supervisorService.get(id)
      .then(hydrate)
      .catch(() => toast.error(t('ui.SupervisorDetailPage.noSePudoCargarEl')))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  const beginEdit = () => { if (sup) hydrate(sup); setEditing(true); };
  const cancelEdit = () => { if (sup) hydrate(sup); setEditing(false); };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {};
      for (const k of Object.keys(form)) body[k] = form[k] === "" ? null : form[k];
      const updated = await supervisorService.update(id, body as Partial<Supervisor>);
      hydrate(updated);
      setEditing(false);
      toast.success("Perfil actualizado");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const onDuty = !!sup?.isOnDuty;

  return (
    <AppLayout>
      <GuardsLayout navKey="supervisors" title={t('ui.SupervisorDetailPage.perfilDelSupervisor')}>
        <PageContainer>
          {loading ? (
            <SkeletonCards count={2} />
          ) : sup ? (
            <>
              {/* Barra de edición — la identidad del supervisor (avatar, nombre,
                  estado) vive en la cabecera compartida de GuardsLayout. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="min-w-0 text-sm font-semibold text-foreground">{t("ui.SupervisorDetail.informacionDelSupervisor", "Información del supervisor")}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {!editing ? (
                    <Button variant="brand" size="sm" onClick={beginEdit}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>{t('actions.cancel')}</Button>
                      <Button variant="brand" size="sm" onClick={save} disabled={saving}>
                        {saving
                          ? <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          : <Check className="mr-2 h-4 w-4" />}
                        {saving ? "Guardando…" : "Guardar"}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {editing && (
                <div
                  className="rounded-xl border px-3 py-2 text-xs"
                  style={{
                    background: "color-mix(in oklab, var(--warn) 12%, transparent)",
                    borderColor: "color-mix(in oklab, var(--warn) 28%, transparent)",
                    color: "var(--warn-text)",
                  }}
                >
                  El nombre, el correo y el teléfono son la identidad del supervisor y se gestionan desde la invitación de acceso (Usuarios de administración).
                </div>
              )}

              {/* Cuenta compartida con otra empresa: el nombre/correo/foto son de
                  su cuenta PERSONAL (no de esta empresa). Zona, vehículo, turno y
                  todo lo operativo sí pertenecen a esta empresa y se editan aquí. */}
              {(sup as any).accountSharedWithOtherCompany && (
                <div
                  className="rounded-xl border px-3 py-2 text-xs"
                  style={{
                    background: "color-mix(in oklab, var(--info, var(--brand)) 10%, transparent)",
                    borderColor: "color-mix(in oklab, var(--info, var(--brand)) 26%, transparent)",
                    color: "var(--ink-soft)",
                  }}
                >
                  Este supervisor también presta servicios con otra empresa en CGuardPro.
                  Su nombre, correo y foto son de su cuenta personal; lo que configures
                  aquí (zona, vehículo, turno, rutas) aplica solo a tu empresa.
                </div>
              )}

              {/* ── BODY GRID ────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* MAIN (2/3) */}
                <div className="lg:col-span-2 space-y-6">
                  <Section title={t("ui.SupervisorDetail.informacionGeneral", "Información general")} icon={<IdCard />}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ReadField label="Nombres" value={sup.firstName} />
                      <ReadField label="Apellidos" value={sup.lastName} />
                      {editing ? (
                        <>
                          <EditText label={t("ui.SupervisorDetail.cedulaId", "Cédula / ID")} value={form.governmentId} onChange={(v) => setField("governmentId", v)} />
                          <EditText label={t('comun.fechaDeNacimiento')} value={form.birthDate} onChange={(v) => setField("birthDate", v)} type="date" />
                          <EditText label="Lugar de nacimiento" value={form.birthPlace} onChange={(v) => setField("birthPlace", v)} />
                          <EditText label={t("ui.SupervisorDetail.direccion", "Dirección")} value={form.address} onChange={(v) => setField("address", v)} />
                        </>
                      ) : (
                        <>
                          <ReadField label={t("ui.SupervisorDetail.cedulaId2", "Cédula / ID")} value={sup.governmentId} />
                          <ReadField label={t('comun.fechaDeNacimiento')} value={fmtDate(sup.birthDate)} />
                          <ReadField label="Lugar de nacimiento" value={sup.birthPlace} />
                          <ReadField label={t("ui.SupervisorDetail.direccion2", "Dirección")} value={sup.address} />
                        </>
                      )}
                    </div>
                  </Section>

                  <Section title={t("ui.SupervisorDetail.informacionPersonal", "Información personal")} icon={<UserCog />}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {editing ? (
                        <>
                          <EditSelect label={t("ui.SupervisorDetail.genero", "Género")} field="gender" value={form.gender} onChange={(v) => setField("gender", v)} />
                          <EditSelect label={t('comun.tipoDeSangre')} field="bloodType" value={form.bloodType} onChange={(v) => setField("bloodType", v)} />
                          <EditSelect label={t('comun.estadoCivil')} field="maritalStatus" value={form.maritalStatus} onChange={(v) => setField("maritalStatus", v)} />
                          <EditSelect label={t("ui.SupervisorDetail.instruccionAcademica", "Instrucción académica")} field="academicInstruction" value={form.academicInstruction} onChange={(v) => setField("academicInstruction", v)} />
                          <EditText label="Credencial" value={form.guardCredentials} onChange={(v) => setField("guardCredentials", v)} />
                          <EditText label={t("ui.SupervisorDetail.fechaDeContratacion", "Fecha de contratación")} value={form.hiringContractDate} onChange={(v) => setField("hiringContractDate", v)} type="date" />
                        </>
                      ) : (
                        <>
                          <ReadField label={t("ui.SupervisorDetail.genero2", "Género")} value={sup.gender} />
                          <ReadField label={t('comun.tipoDeSangre')} value={sup.bloodType} />
                          <ReadField label={t('comun.estadoCivil')} value={sup.maritalStatus} />
                          <ReadField label={t("ui.SupervisorDetail.instruccionAcademica2", "Instrucción académica")} value={sup.academicInstruction} />
                          <ReadField label="Credencial" value={sup.guardCredentials} />
                          <ReadField label={t("ui.SupervisorDetail.fechaDeContratacion2", "Fecha de contratación")} value={fmtDate(sup.hiringContractDate)} />
                        </>
                      )}
                    </div>
                  </Section>

                  <Section title={t('ui.SupervisorDetailPage.coberturaYHorario')} icon={<CalendarClock />}>
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      La zona y los puestos que cubre este supervisor, y su horario generado, se ven en sus pestañas dedicadas.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/supervisors/${id}/cobertura`)}>
                        <MapPin className="mr-2 h-4 w-4" /> Cobertura
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/supervisors/${id}/horario`)}>
                        <CalendarClock className="mr-2 h-4 w-4" /> Horario
                      </Button>
                    </div>
                  </Section>

                  <SedesAsignadas userId={String(id)} />
                </div>

                {/* SIDEBAR (1/3) */}
                <div className="space-y-6">
                  <Section title={t("ui.SupervisorDetail.operacion", "Operación")} icon={<Car />}>
                    <div className="space-y-4">
                      {editing ? (
                        <>
                          <EditText label={t("ui.SupervisorDetail.zonaPosicionPEjAguila2", "Zona / posición (p. ej. Aguila2)")} value={form.zone} onChange={(v) => setField("zone", v)} />
                          <EditText label={t("ui.SupervisorDetail.vehiculoAsignado", "Vehículo asignado")} value={form.assignedVehicle} onChange={(v) => setField("assignedVehicle", v)} />
                        </>
                      ) : (
                        <>
                          <ReadField label={t("ui.SupervisorDetail.zonaPosicion", "Zona / posición")} value={sup.zone} />
                          <ReadField label={t("ui.SupervisorDetail.vehiculoAsignado2", "Vehículo asignado")} value={sup.assignedVehicle} />
                        </>
                      )}
                    </div>
                  </Section>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<UserCog />}
              title={t('ui.SupervisorDetailPage.supervisorNoEncontrado')}
              description={t('ui.SupervisorDetailPage.puedeQueSeHayaDado')}
            />
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
