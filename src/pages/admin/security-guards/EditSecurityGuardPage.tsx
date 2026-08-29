import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UserCog, User, Phone, MapPin, FileText } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import securityGuardService from "@/lib/api/securityGuardService";
import Breadcrumb from "@/components/ui/breadcrumb";
import { usePermissions } from '@/hooks/usePermissions';
import { PageContainer, PageHeader, Section, SkeletonCards } from '@/components/kit';

export default function EditSecurityGuardPage() {
  const { t } = useTranslation();
  // Deduplicate toasts across component remounts (React StrictMode may mount twice)
  // Use a module-scoped Set to avoid showing the same toast multiple times.
  // Keys used below: 'edit-guard-not-found' and 'edit-guard-general-error'
  const shownToasts = useRef<Set<string>>(new Set());

  function showToastOnce(key: string, message: string) {
    if (shownToasts.current.has(key)) return;
    shownToasts.current.add(key);
    toast.error(message);
  }
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  useEffect(() => {
    if (!hasPermission('securityGuardEdit')) {
      if (!toastAndRedirected.current) {
        toastAndRedirected.current = true;
        toast.error(t('ui.EditSecurityGuardPage.noTienesPermisoParaEditar'));
        navigate('/security-guards');
      }
    }
  }, [hasPermission, navigate]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const toastAndRedirected = useRef(false);
  const generalErrorShown = useRef(false);
  const hasFetched = useRef(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    address: "",
    birthDate: "",
    birthPlace: "",
    maritalStatus: "",
    bloodType: "",
    academicInstruction: "",
    hiringContractDate: "",
    hourlyRate: "",
    gender: "",
    governmentId: "",
    guardCredentials: "",
  });
  const [fetchedData, setFetchedData] = useState<any>(null);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    if (!id) return;
    setLoading(true);
    (async () => {
      try {
        const data = await securityGuardService.get(id);
        setFetchedData(data);
        const g = data.guard ?? data;
        setForm({
          firstName: g.firstName ?? "",
          lastName: g.lastName ?? "",
          email: g.email ?? "",
          phoneNumber: g.phoneNumber ?? "",
          address: data.address ?? "",
          birthDate: data.birthDate ?? "",
          birthPlace: data.birthPlace ?? "",
          maritalStatus: data.maritalStatus ?? "",
          bloodType: data.bloodType ?? "",
          academicInstruction: data.academicInstruction ?? "",
          hiringContractDate: data.hiringContractDate ?? "",
          hourlyRate: data.hourlyRateCents != null ? String(data.hourlyRateCents / 100) : "",
          gender: data.gender ?? "",
          governmentId: data.governmentId ?? "",
          guardCredentials: data.guardCredentials ?? "",
        });
      } catch (err: any) {
        let msg = err?.message || err;
        if (
          !toastAndRedirected.current &&
          (err?.response?.status === 404 || (typeof msg === 'string' && msg.toLowerCase().includes('extraviado')))
        ) {
          toastAndRedirected.current = true;
          setRedirecting(true);
          setError(null);
          setForm({
            firstName: "",
            lastName: "",
            email: "",
            phoneNumber: "",
            address: "",
            birthDate: "",
            birthPlace: "",
            maritalStatus: "",
            bloodType: "",
            academicInstruction: "",
            hiringContractDate: "",
    hourlyRate: "",
            gender: "",
            governmentId: "",
            guardCredentials: "",
          });
          showToastOnce('edit-guard-not-found', "No se encontró el vigilante solicitado.");
          navigate('/security-guards', { replace: true });
        } else if (!generalErrorShown.current) {
          generalErrorShown.current = true;
          let details = '';
          if (err?.response) {
            details = JSON.stringify(err.response, null, 2);
          } else if (err?.stack) {
            details = err.stack;
          }
          showToastOnce('edit-guard-general-error', `Error cargando vigilante: ${msg}`);
          setError(`Error cargando vigilante: ${msg}${details ? '\n' + details : ''}`);
          setRedirecting(true);
          navigate('/security-guards', { replace: true });
        }
      } finally {
        setLoading(false);
      }
    })();
    // Limpiar la ref al desmontar
    return () => {
      toastAndRedirected.current = false;
      generalErrorShown.current = false;
      hasFetched.current = false;
    };
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  // Constrained fields carry notEmpty/isIn validators on the backend, so send
  // null (not "") when the user hasn't picked a value for a not-yet-filled draft.
  const orNull = (v: string) => (v && String(v).trim() ? v : null);

  // Mismo aspecto que los campos del sistema para que los selects nativos encajen.
  const selectClass =
    "cg-input flex h-10 w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Build a CLEAN payload — ONLY fields the update endpoint handles.
        // Identity fields (name/email/phone) now DO persist: the backend
        // propagates them to the linked USER (single source of identity) and
        // fans the change out to every denormalized copy.
        const payload: any = {
          firstName: orNull(form.firstName),
          lastName: orNull(form.lastName),
          email: orNull(form.email),
          phoneNumber: orNull(form.phoneNumber),
          governmentId: orNull(form.governmentId),
          address: orNull(form.address),
          birthPlace: orNull(form.birthPlace),
          guardCredentials: orNull(form.guardCredentials),
          gender: orNull(form.gender),
          bloodType: orNull(form.bloodType),
          maritalStatus: orNull(form.maritalStatus),
          academicInstruction: orNull(form.academicInstruction),
        };
        // Dates: only send when present (avoid clearing with empty string).
        if (form.birthDate) payload.birthDate = form.birthDate;
        if (form.hiringContractDate) payload.hiringContractDate = form.hiringContractDate;
        // Tarifa/hora: dólares en pantalla, centavos en la base. Vacío = null
        // (sin tarifa), jamás un cero mentiroso.
        payload.hourlyRateCents = form.hourlyRate !== "" && !Number.isNaN(Number(form.hourlyRate))
          ? Math.round(Number(form.hourlyRate) * 100) : null;

        await securityGuardService.update(id!, payload);
        navigate("/security-guards");
      } catch (err: any) {
        const msg = err?.message || String(err);
        toast.error("Error guardando cambios: " + msg);
      } finally {
        setLoading(false);
      }
    })();
  }

  if (redirecting) return null;

  return (
    <AppLayout>
      <PageContainer>
        <Breadcrumb
          items={[
            { label: "Panel de control", path: "/dashboard" },
            { label: "Editar vigilante" },
          ]}
        />

        <PageHeader
          icon={<UserCog />}
          title={t('ui.EditSecurityGuardPage.editarVigilante')}
          subtitle={t('ui.EditSecurityGuardPage.actualizaLosDatosPersonalesDe')}
        />

        {error && (
          <div
            className="rounded-2xl border p-3 text-sm"
            style={{
              background: 'color-mix(in oklab, var(--bad) 12%, transparent)',
              borderColor: 'color-mix(in oklab, var(--bad) 28%, transparent)',
              color: 'var(--bad-text)',
            }}
          >
            {error}
          </div>
        )}

        {loading && !fetchedData ? (
          <SkeletonCards count={4} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ── Datos personales ─────────────────────────────────── */}
            <Section title="Datos personales" icon={<User />}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('comun.nombreReq')}</label>
                  <Input name="firstName" value={form.firstName} onChange={handleChange} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Apellidos *</label>
                  <Input name="lastName" value={form.lastName} onChange={handleChange} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('comun.fechaDeNacimiento')}</label>
                  <Input name="birthDate" value={form.birthDate} onChange={handleChange} type="date" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('guards.profile.fields.birthPlace', 'Lugar de nacimiento')}</label>
                  <Input name="birthPlace" value={form.birthPlace} onChange={handleChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('comun.estadoCivil')}</label>
                  <select name="maritalStatus" value={form.maritalStatus} onChange={handleChange} className={selectClass}>
                    <option value="">{t('comun.seleccionar')}</option>
                    {["Soltero", "Casado", "Unión libre", "Divorciado"].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('comun.tipoDeSangre')}</label>
                  <select name="bloodType" value={form.bloodType} onChange={handleChange} className={selectClass}>
                    <option value="">{t('comun.seleccionar')}</option>
                    {["A+", "A-", "AB+", "AB-", "O+", "O-", "B+", "B-"].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("ui.EditSecurityGuard.instruccionAcademica", "Instrucción académica")}</label>
                  <select name="academicInstruction" value={form.academicInstruction} onChange={handleChange} className={selectClass}>
                    <option value="">{t('comun.seleccionar')}</option>
                    {["Secundaria", "Universitaria", "Universidad", "Especial", "Primaria"].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("ui.EditSecurityGuard.genero", "Género")}</label>
                  <select name="gender" value={form.gender} onChange={handleChange} className={selectClass}>
                    <option value="">{t('comun.seleccionar')}</option>
                    {["Masculino", "Femenino"].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Section>

            {/* ── Contacto y domicilio ─────────────────────────────── */}
            <Section title={t('ui.EditSecurityGuardPage.contactoYDomicilio')} icon={<Phone />}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("ui.EditSecurityGuard.correoElectronico", "Correo Electrónico *")}</label>
                  <Input name="email" value={form.email} onChange={handleChange} required type="email" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("ui.EditSecurityGuard.telefono", "Teléfono *")}</label>
                  <Input name="phoneNumber" value={form.phoneNumber} onChange={handleChange} required />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">{t("ui.EditSecurityGuard.direccion", "Dirección")}</label>
                  <Input name="address" value={form.address} onChange={handleChange} />
                </div>
              </div>
            </Section>

            {/* ── Identificación y contrato ────────────────────────── */}
            <Section title={t("ui.EditSecurityGuard.identificacionYContrato", "Identificación y contrato")} icon={<FileText />}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("ui.EditSecurityGuard.cedula", "Cédula")}</label>
                  <Input name="governmentId" value={form.governmentId} onChange={handleChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contrato</label>
                  <Input name="hiringContractDate" value={form.hiringContractDate} onChange={handleChange} type="date" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('ui.EditSecurityGuardPage.tarifaPorHoraUs')}</label>
                  <Input name="hourlyRate" value={form.hourlyRate} onChange={handleChange} type="number" step="0.01" min="0" placeholder="3.50" />
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>{t('ui.EditSecurityGuardPage.conEstoElResumenDe')}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">{t('ui.EditSecurityGuardPage.credencialesDelVigilante')}</label>
                  <Input name="guardCredentials" value={form.guardCredentials} onChange={handleChange} />
                </div>
              </div>
            </Section>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={loading}>
                Guardar cambios
              </Button>
            </div>
            {/* error display removed per UX request; errors now shown via toast */}
          </form>
        )}
      </PageContainer>
    </AppLayout>
  );
}
