import type { GuardDetail } from "../../guardDetailTypes";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Pencil, Mail, Loader2 } from "lucide-react";

import { getTenantTimezone } from "@/utils/tenantLocation";
import securityGuardService from "@/lib/api/securityGuardService";
import { userService } from "@/lib/api/userService";
import { useRegistroDeFicha } from "@/layouts/FichaPersona";
import { ApiService } from "@/services/api/apiService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Section, Field, StatusBadge } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { correoVisible } from "@/lib/correoVisible";
import { useCompartirAcceso } from "@/components/usuarioDeAcceso/CompartirAcceso";
import { UsuarioDeAccesoEditable } from "@/components/usuarioDeAcceso/UsuarioDeAccesoEditable";
import GuardsLayout from "@/layouts/GuardsLayout";
import AppLayout from "@/layouts/app-layout";
import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";
import { soloFechaCivil, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";
/** The linked app user carried under `guard` on the securityGuard record. */
interface ProfileUser {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Usuario para entrar (alias). */
  username?: string;
  status?: string;
  hasPassword?: boolean;
  invitationTokenExpiresAt?: string;
  lastLoginAt?: string;
  homeAddress?: string;
}

/** A license summary shown in the sidebar. */
interface ProfileLicense {
  type?: string;
  number?: string;
  expiryDate?: string;
}

/**
 * The full securityGuard record this page loads/edits. Only a whitelisted subset
 * (EDITABLE_*) is actually persisted; the rest is read-only. Index signature
 * covers dynamic field access in the edit-form builder.
 */
interface ProfileGuard extends Omit<GuardDetail, "guard"> {
  address?: string;
  birthPlace?: string;
  birthDate?: string;
  hiringContractDate?: string;
  gender?: string;
  bloodType?: string;
  maritalStatus?: string;
  academicInstruction?: string;
  guardCredentials?: string;
  languages?: string[] | string;
  skills?: string[] | string;
  deviceType?: string;
  deviceInfo?: {
    platform?: string;
    model?: string;
    osVersion?: string;
    appVersion?: string;
  };
  licenses?: ProfileLicense[];
  guard?: ProfileUser;
  [key: string]: unknown;
}

type Props = {
  guard: ProfileGuard;
  onGuardUpdate?: (updatedGuard: ProfileGuard) => void;
};

/** A guard-shift attendance row (read-only history). */
interface GuardShiftRow {
  id: string;
  stationName?: string | { stationName?: string; name?: string };
  station?: { stationName?: string; name?: string };
  shiftSchedule?: string;
  sessions?: Array<{ in?: string; out?: string }>;
  punchInTime?: string;
  punchOutTime?: string;
}

/** Dropdown options matching the backend isIn validators. TRAMPA: estas cadenas
 *  en español son el VALOR que se guarda, no una etiqueta — el backend las valida
 *  con isIn. No se traducen aquí: se traduce sólo lo que se PINTA, vía
 *  FIELD_OPTION_KEYS, y el `value` del <option> sigue siendo la cadena original. */
const FIELD_OPTIONS: Record<string, string[]> = {
  gender: ["Masculino", "Femenino"],
  bloodType: ["A+", "A-", "AB+", "AB-", "O+", "O-", "B+", "B-"],
  maritalStatus: ["Soltero", "Casado", "Unión libre", "Divorciado"],
  academicInstruction: [
    "Primaria",
    "Secundaria",
    "Universitaria",
    "Universidad",
    "Especial",
  ],
};

/** Valor guardado → clave de traducción para su etiqueta visible. Los tipos de
 *  sangre (A+, O-…) no llevan clave: son iguales en todos los idiomas. */
const FIELD_OPTION_KEYS: Record<string, string> = {
  Masculino: "invite.guard.male",
  Femenino: "invite.guard.female",
  Soltero: "invite.guard.single",
  Casado: "invite.guard.married",
  "Unión libre": "guards.profile.maritalStatus.freeUnion",
  Divorciado: "invite.guard.divorced",
  Primaria: "guards.profile.academic.primary",
  Secundaria: "guards.profile.academic.secondary",
  Universitaria: "guards.profile.academic.university",
  Universidad: "guards.profile.academic.universityDegree",
  Especial: "guards.profile.academic.special",
};

/** Etiqueta visible de un valor guardado. Se llama DENTRO del render. */
const optionLabel = (value?: string | null) => {
  if (!value) return value;
  const key = FIELD_OPTION_KEYS[value];

  return key ? i18n.t(key, value) : value;
};

/** ONLY these securityGuard fields are accepted by the update endpoint. The save
 *  payload is built from exactly this list, so editing actually persists (the old
 *  page POSTed the whole bloated object — incl. the nested user/image arrays —
 *  which silently failed). Name/email/phone live on the linked USER (identity) and
 *  are shown read-only in the header. */
const EDITABLE_TEXT = [
  "governmentId",
  "address",
  "birthPlace",
  "guardCredentials",
] as const;
const EDITABLE_SELECT = [
  "gender",
  "bloodType",
  "maritalStatus",
  "academicInstruction",
] as const;
const EDITABLE_DATE = ["birthDate", "hiringContractDate"] as const;

function toDateInput(v: string | number | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);

  if (isNaN(d.getTime())) return "";

  return d.toISOString().slice(0, 10);
}

// ── Piezas de presentación ──────────────────────────────────────────────────
/** Dato de solo lectura — misma rejilla que el resto de fichas del vigilante. */
const ReadField = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => <Field label={label} value={value} />;

const EditText = ({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) => (
  <div>
    <div className="cg-eyebrow mb-1">{label}</div>
    <Input
      className="h-9 text-sm"
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const EditSelect = ({
  label,
  value,
  field,
  onChange,
}: {
  label: string;
  value: string;
  field: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <div className="cg-eyebrow mb-1">{label}</div>
    <select
      className="cg-input flex h-9 w-full px-2 text-sm"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{i18n.t("comun.seleccionar")}</option>
      {(FIELD_OPTIONS[field] || []).map((o) => (
        <option key={o} value={o}>
          {optionLabel(o)}
        </option>
      ))}
    </select>
  </div>
);

export default function GuardProfile({ guard, onGuardUpdate }: Props) {
  const { id } = useParams();
  const { t } = useTranslation();

  const [data, setData] = useState<ProfileGuard>({ ...guard });
  const { hasPermission } = usePermissions();
  // «Usuario: jmiranda · comparte este enlace» (cuenta sin correo).
  const compartir = useCompartirAcceso();
  const [form, setForm] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const savedRef = useRef<ProfileGuard>({ ...guard });

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  /* ── El registro completo, leído por la ruta padre ────────────────────────
     Esto pedía `GET /security-guard/:id` mientras la cabecera pedía el mismo,
     así que el perfil salía con la petición duplicada (medido: 2x). */
  const { registro } = useRegistroDeFicha(id);

  useEffect(() => {
    if (!registro) return;
    const resp = registro as ProfileGuard & { data?: ProfileGuard };
    const payload: ProfileGuard =
      resp && resp.id ? resp : resp && resp.data ? resp.data : resp;

    setData((prev) => ({ ...prev, ...payload }));
    savedRef.current = { ...savedRef.current, ...payload };
    if (onGuardUpdate) onGuardUpdate(payload);
    // `onGuardUpdate` cambia de identidad en cada render del padre; meterlo en
    // las dependencias volvería a disparar esto en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registro]);

  const beginEdit = () => {
    const src = data || ({} as ProfileGuard);
    const next: Record<string, string> = {};

    [...EDITABLE_TEXT, ...EDITABLE_SELECT].forEach((f) => {
      next[f] = (src[f] as string) ?? "";
    });
    EDITABLE_DATE.forEach((f) => {
      next[f] = toDateInput(src[f] as string | undefined);
    });
    // El nombre vive en el USUARIO (la cuenta), no en la ficha: se edita aparte.
    next.firstName = src.guard?.firstName ?? "";
    next.lastName = src.guard?.lastName ?? "";
    next.languages = Array.isArray(src.languages)
      ? src.languages.join(", ")
      : src.languages || "";
    next.skills = Array.isArray(src.skills)
      ? src.skills.join(", ")
      : src.skills || "";
    setForm(next);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm({});
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // Build a CLEAN payload — ONLY backend-accepted securityGuard fields.
      const payload: Record<string, unknown> = {};

      [...EDITABLE_TEXT, ...EDITABLE_SELECT].forEach((f) => {
        payload[f] = form[f] ?? null;
      });
      EDITABLE_DATE.forEach((f) => {
        if (form[f]) payload[f] = form[f];
      });
      payload.languages = String(form.languages || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      payload.skills = String(form.skills || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      /* EL NOMBRE, APARTE. Vive en la cuenta de la persona, no en la ficha:
         por eso antes no se podía cambiar desde aquí. Nombres y apellidos
         viajan separados para que un segundo nombre no acabe en los apellidos. */
      const nombres = String(form.firstName || "").trim();
      const apellidos = String(form.lastName || "").trim();
      const cambioDeNombre =
        !!data?.guard?.id &&
        (nombres !== (data?.guard?.firstName || "") || apellidos !== (data?.guard?.lastName || ""));

      if (cambioDeNombre && !nombres) {
        toast.error(t("guards.profile.toasts.firstNameRequired", "Escribe al menos el nombre."));

        return;
      }
      if (cambioDeNombre) await userService.cambiarNombre(String(data!.guard!.id), nombres, apellidos);

      await securityGuardService.update(id, payload);
      const merged: any = { ...data, ...payload };

      if (cambioDeNombre) {
        merged.guard = { ...(data?.guard || {}), firstName: nombres, lastName: apellidos };
        merged.fullName = [nombres, apellidos].filter(Boolean).join(" ");
      }

      setData(merged);
      savedRef.current = merged;
      setEditing(false);
      setForm({});
      toast.success(t("guards.profile.toasts.updated") || "Perfil actualizado");
      if (onGuardUpdate) onGuardUpdate(merged);
    } catch (error: any) {
      console.error("Error actualizando vigilante:", error);
      toast.error(
        error?.message ||
          t("guards.profile.toasts.updateError") ||
          "No se pudo guardar",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Licenses: they live in their own table, not on the guard record, so
  // `data.licenses` was always empty and the card said «none» next to a
  // license on the Licencias tab.
  const [licencias, setLicencias] = useState<ProfileLicense[]>([]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;

    securityGuardService
      .getSecurityGuardLicenses(id, { limit: 10, offset: 0 })
      .then((resp: any) => {
        if (!vivo) return;
        const rows: any[] = Array.isArray(resp?.rows)
          ? resp.rows
          : Array.isArray(resp)
            ? resp
            : [];

        setLicencias(
          rows.map((l) => ({
            type: l?.licenseType?.name || l?.customName || undefined,
            number: l?.number || undefined,
            expiryDate: l?.expiryDate || undefined,
          })),
        );
      })
      .catch(() => {
        /* the card just stays empty */
      });

    return () => {
      vivo = false;
    };
  }, [id]);
  const licenciasDelPerfil =
    data?.licenses && data.licenses.length > 0 ? data.licenses : licencias;

  // ── Attendance (read-only history) ──────────────────────────────────────────
  const [guardShifts, setGuardShifts] = useState<GuardShiftRow[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoadingShifts(true);
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const resp = (await ApiService.get(
          `/tenant/${tenantId}/guard-shift?filter[guardName]=${encodeURIComponent(id)}&limit=20`,
        )) as { rows?: GuardShiftRow[] } | GuardShiftRow[];

        setGuardShifts(
          Array.isArray(resp) ? resp : resp && resp.rows ? resp.rows : [],
        );
      } catch (err) {
        console.error("Failed loading guard shifts", err);
      } finally {
        setLoadingShifts(false);
      }
    })();
  }, [id]);

  // El correo de verdad, o null si la cuenta no tiene buzón (entra con su usuario).
  const correoGuardia = correoVisible(data?.guard?.email);

  const handleSendAppAccess = async () => {
    if (!id) return;
    setSendingInvite(true);
    try {
      const payload: Record<string, unknown> = { securityGuardId: id };

      if (data?.guard?.id) payload.guard = data.guard.id;
      else if (correoGuardia) payload.contact = correoGuardia;
      if (data?.guard?.firstName) payload.firstName = data.guard.firstName;
      if (data?.guard?.lastName) payload.lastName = data.guard.lastName;
      // Sin correo: el servidor devuelve el enlace para dárselo en mano.
      if (!correoGuardia) payload.compartir = true;
      const r: any = await securityGuardService.resendInvite(payload);
      const enlace = r?.invitationLink || r?.link || null;

      if (!correoGuardia && enlace) {
        compartir.abrir(
          [
            {
              nombre: fullName,
              username: r?.username || data?.guard?.username || null,
              link: enlace,
            },
          ],
          "invitacion",
        );
      } else {
        toast.success(
          t("guards.profile.access.inviteSent") || "Invitación enviada",
        );
      }
      const refreshed = (await securityGuardService.get(id)) as ProfileGuard & {
        data?: ProfileGuard;
      };
      const d =
        refreshed && refreshed.id
          ? refreshed
          : refreshed && refreshed.data
            ? refreshed.data
            : refreshed;

      setData((prev) => ({ ...prev, ...d }));
    } catch (err: any) {
      console.error("Send app access failed", err);
      toast.error(
        err?.message ||
          t("guards.profile.access.inviteError") ||
          "Error al enviar invitación",
      );
    } finally {
      setSendingInvite(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const avatar = (() => {
    const pi = data?.profileImage;

    if (Array.isArray(pi))
      return pi[0]?.downloadUrl || pi[0]?.publicUrl || null;

    return (
      pi?.downloadUrl ||
      pi?.publicUrl ||
      (typeof pi === "string" && pi ? pi : null)
    );
  })();
  const fullName =
    data?.fullName ||
    [data?.guard?.firstName, data?.guard?.lastName].filter(Boolean).join(" ") ||
    t("guards.profile.nav") ||
    "Vigilante";
  const onDuty = !!data?.isOnDuty;
  const gStatus = data?.guard?.status;
  const hasPassword = data?.guard?.hasPassword;
  const isActivated = hasPassword && gStatus === "active";
  const tokenExpires = data?.guard?.invitationTokenExpiresAt;
  const tokenExpired = tokenExpires && new Date(tokenExpires) < new Date();

  // Tono del acceso: verde si ya entró, rojo si la invitación caducó, ámbar si sigue pendiente.
  const accessBadge = isActivated
    ? {
        txt: t("guards.profile.access.statusActive") || "App activa",
        tone: "ok",
      }
    : tokenExpired
      ? {
          txt:
            t("guards.profile.access.statusExpired") || "Invitación expirada",
          tone: "bad",
        }
      : {
          txt: t("guards.profile.access.statusPending") || "Acceso pendiente",
          tone: "warn",
        };

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title={t("guards.nav.perfil")}>
        <div className="mx-auto max-w-5xl space-y-6 pb-24">
          {/* Edit toolbar — the guard's identity (avatar/name/status) lives in
              the shared GuardsLayout header card above. */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {t("guards.nav.perfil", "Perfil")}
            </h2>
            <div className="flex items-center gap-2">
              {!editing ? (
                <Button size="sm" variant="brand" onClick={beginEdit}>
                  <Pencil className="h-4 w-4" />
                  {t("guards.profile.actions.edit") || "Editar"}
                </Button>
              ) : (
                <>
                  <Button
                    disabled={saving}
                    size="sm"
                    variant="outline"
                    onClick={cancelEdit}
                  >
                    {t("guards.profile.actions.cancel") || "Cancelar"}
                  </Button>
                  <Button
                    disabled={saving}
                    size="sm"
                    variant="brand"
                    onClick={save}
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {saving
                      ? t("guards.profile.actions.saving") || "Guardando…"
                      : t("guards.profile.actions.save") || "Guardar"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {editing && (
            <div
              className="rounded-xl border px-3 py-2 text-xs"
              style={{
                background: "var(--brand-wash)",
                borderColor: "var(--brand-line)",
                color: "var(--ink-soft)",
              }}
            >
              {t("guards.profile.editHint") ||
                "El correo y el teléfono son la identidad del vigilante y se gestionan desde la invitación de acceso."}
            </div>
          )}

          {/* ── INFO GRID ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* MAIN (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              <Section
                title={
                  t("guards.profile.cards.general") || "Información general"
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editing && data?.guard?.id ? (
                    <>
                      <EditText
                        label={t("guards.profile.fields.firstName") || "Nombres"}
                        value={form.firstName}
                        onChange={(v) => setField("firstName", v)}
                      />
                      <EditText
                        label={t("guards.profile.fields.lastName") || "Apellidos"}
                        value={form.lastName}
                        onChange={(v) => setField("lastName", v)}
                      />
                    </>
                  ) : (
                    <>
                      <ReadField
                        label={t("guards.profile.fields.firstName") || "Nombres"}
                        value={data?.guard?.firstName}
                      />
                      <ReadField
                        label={t("guards.profile.fields.lastName") || "Apellidos"}
                        value={data?.guard?.lastName}
                      />
                    </>
                  )}
                  {editing ? (
                    <>
                      <EditText
                        label={t("guards.profile.fields.id1") || "Cédula / ID"}
                        value={form.governmentId}
                        onChange={(v) => setField("governmentId", v)}
                      />
                      <EditText
                        label={
                          t("guards.profile.fields.birthDate") ||
                          "Fecha de nacimiento"
                        }
                        type="date"
                        value={form.birthDate}
                        onChange={(v) => setField("birthDate", v)}
                      />
                      <EditText
                        label={
                          t("guards.profile.fields.birthPlace") ||
                          "Lugar de nacimiento"
                        }
                        value={form.birthPlace}
                        onChange={(v) => setField("birthPlace", v)}
                      />
                      <EditText
                        label={
                          t("guards.profile.fields.address") || "Dirección"
                        }
                        value={form.address}
                        onChange={(v) => setField("address", v)}
                      />
                    </>
                  ) : (
                    <>
                      <ReadField
                        label={t("guards.profile.fields.id1") || "Cédula / ID"}
                        value={data?.governmentId}
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.birthDate") ||
                          "Fecha de nacimiento"
                        }
                        value={
                          data?.birthDate
                            ? soloFechaCivil(data.birthDate, {}, "")
                            : null
                        }
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.birthPlace") ||
                          "Lugar de nacimiento"
                        }
                        value={data?.birthPlace}
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.address") || "Dirección"
                        }
                        value={data?.address || data?.guard?.homeAddress}
                      />
                    </>
                  )}
                </div>
              </Section>

              <Section
                title={
                  t("guards.profile.cards.personal") || "Información personal"
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editing ? (
                    <>
                      <EditSelect
                        field="gender"
                        label={t("guards.profile.fields.gender") || "Género"}
                        value={form.gender}
                        onChange={(v) => setField("gender", v)}
                      />
                      <EditSelect
                        field="bloodType"
                        label={
                          t("guards.profile.fields.bloodType") ||
                          "Tipo de sangre"
                        }
                        value={form.bloodType}
                        onChange={(v) => setField("bloodType", v)}
                      />
                      <EditSelect
                        field="maritalStatus"
                        label={
                          t("guards.profile.fields.maritalStatus") ||
                          "Estado civil"
                        }
                        value={form.maritalStatus}
                        onChange={(v) => setField("maritalStatus", v)}
                      />
                      <EditSelect
                        field="academicInstruction"
                        label={
                          t("guards.profile.fields.education") ||
                          "Instrucción académica"
                        }
                        value={form.academicInstruction}
                        onChange={(v) => setField("academicInstruction", v)}
                      />
                      <EditText
                        label={
                          t("guards.profile.fields.guardCredentials") ||
                          "Credencial"
                        }
                        value={form.guardCredentials}
                        onChange={(v) => setField("guardCredentials", v)}
                      />
                      <EditText
                        label={t(
                          "guards.profile.fields.hireDate",
                          "Fecha de contratación",
                        )}
                        type="date"
                        value={form.hiringContractDate}
                        onChange={(v) => setField("hiringContractDate", v)}
                      />
                    </>
                  ) : (
                    <>
                      <ReadField
                        label={t("guards.profile.fields.gender") || "Género"}
                        value={optionLabel(data?.gender)}
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.bloodType") ||
                          "Tipo de sangre"
                        }
                        value={data?.bloodType}
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.maritalStatus") ||
                          "Estado civil"
                        }
                        value={optionLabel(data?.maritalStatus)}
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.education") ||
                          "Instrucción académica"
                        }
                        value={optionLabel(data?.academicInstruction)}
                      />
                      <ReadField
                        label={
                          t("guards.profile.fields.guardCredentials") ||
                          "Credencial"
                        }
                        value={data?.guardCredentials}
                      />
                      <ReadField
                        label={t(
                          "guards.profile.fields.hireDate",
                          "Fecha de contratación",
                        )}
                        value={
                          data?.hiringContractDate
                            ? soloFechaCivil(data.hiringContractDate, {}, "")
                            : null
                        }
                      />
                    </>
                  )}
                </div>
              </Section>

              <Section
                title={
                  t("guards.profile.cards.languagesSkills") ||
                  "Idiomas y habilidades"
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editing ? (
                    <>
                      <EditText
                        label={
                          t("guards.profile.fields.languages") || "Idiomas"
                        }
                        value={form.languages}
                        onChange={(v) => setField("languages", v)}
                      />
                      <EditText
                        label={
                          t("guards.profile.fields.skills") || "Habilidades"
                        }
                        value={form.skills}
                        onChange={(v) => setField("skills", v)}
                      />
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="cg-eyebrow mb-1.5">
                          {t("guards.profile.fields.languages") || "Idiomas"}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(data?.languages)
                            ? data.languages
                            : []
                          )
                            .filter(Boolean)
                            .map((l: string) => (
                              <span
                                key={l}
                                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                                style={{
                                  background: "var(--glass-sunken)",
                                  borderColor: "var(--hairline)",
                                }}
                              >
                                {l}
                              </span>
                            ))}
                          {(!data?.languages || !data.languages.length) && (
                            <span
                              className="text-sm"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              —
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="cg-eyebrow mb-1.5">
                          {t("guards.profile.fields.skills") || "Habilidades"}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(data?.skills) ? data.skills : [])
                            .filter(Boolean)
                            .map((s: string) => (
                              <span
                                key={s}
                                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                                style={{
                                  background: "var(--glass-sunken)",
                                  borderColor: "var(--hairline)",
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          {(!data?.skills || !data.skills.length) && (
                            <span
                              className="text-sm"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              —
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {editing && (
                  <p
                    className="mt-2 text-[11px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t("guards.profile.placeholders.csvHint") ||
                      "Separa con comas."}
                  </p>
                )}
              </Section>

              {/* Attendance */}
              <Section
                title={
                  t("guards.profile.cards.attendance") || "Asistencia reciente"
                }
              >
                {loadingShifts ? (
                  <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("common.loading") || "Cargando…"}
                  </div>
                ) : guardShifts.length === 0 ? (
                  <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("guards.profile.noAttendance") ||
                      "Sin registros de asistencia."}
                  </div>
                ) : (
                  <ul
                    className="divide-y"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {guardShifts.slice(0, 8).map((s) => {
                      // The guard-shift rows expose `stationName`/`guardName` as
                      // nested OBJECTS ({ stationName }, { fullName }) — rendering
                      // one raw throws React #31. And punch times live on the
                      // dedup `sessions[]` (in/out), not flat punchIn/OutTime.
                      const stationLabel =
                        (s.stationName && typeof s.stationName === "object"
                          ? s.stationName.stationName || s.stationName.name
                          : s.stationName) ||
                        (s.station &&
                          (s.station.stationName || s.station.name)) ||
                        s.shiftSchedule ||
                        "—";
                      const sessions = Array.isArray(s.sessions)
                        ? s.sessions
                        : [];
                      const lastSession = sessions.length
                        ? sessions[sessions.length - 1]
                        : null;
                      const punchIn = lastSession?.in || s.punchInTime || null;
                      const punchOut =
                        lastSession?.out || s.punchOutTime || null;

                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {stationLabel}
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {punchIn
                                ? new Date(punchIn).toLocaleString(
                                    localeActual(),
                                    { timeZone: getTenantTimezone() },
                                  )
                                : "—"}
                              {" → "}
                              {punchOut ? (
                                new Date(punchOut).toLocaleString(
                                  localeActual(),
                                  { timeZone: getTenantTimezone() },
                                )
                              ) : (
                                <span
                                  className="font-medium"
                                  style={{ color: "var(--ok-text)" }}
                                >
                                  {t("ui.GuardProfilepage.enCurso", "En curso")}
                                </span>
                              )}
                            </div>
                          </div>
                          <StatusBadge
                            className="shrink-0"
                            dot={!punchOut}
                            tone={punchOut ? "neutral" : "ok"}
                          >
                            {s.shiftSchedule || t("comun.turno", "Turno")}
                          </StatusBadge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </div>

            {/* SIDEBAR (1/3) */}
            <div className="space-y-6">
              {/* App access */}
              <Section
                title={t("guards.profile.cards.appAccess") || "Acceso a la app"}
              >
                <div className="space-y-3">
                  <StatusBadge tone={accessBadge.tone}>
                    {accessBadge.txt}
                  </StatusBadge>
                  {data?.guard?.lastLoginAt && (
                    <div
                      className="text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("guards.profile.access.lastLogin") || "Último ingreso"}
                      :{" "}
                      <span
                        className="font-medium"
                        style={{ color: "var(--ink)" }}
                      >
                        {new Date(data.guard.lastLoginAt).toLocaleString(
                          localeActual(), { timeZone: zonaDeLaEmpresa() })}
                      </span>
                    </div>
                  )}
                  {data?.guard?.id && (
                    <UsuarioDeAccesoEditable
                      puedeEditar={hasPermission("securityGuardEdit")}
                      userId={data.guard.id}
                      username={data.guard.username}
                      onCambiado={(username) =>
                        setData((prev) => ({
                          ...prev,
                          guard: { ...(prev.guard || {}), username },
                        }))
                      }
                    />
                  )}
                  {correoGuardia ? (
                    <div
                      className="text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("guards.profile.access.sendTo") || "Enviar a"}:{" "}
                      <span
                        className="font-medium"
                        style={{ color: "var(--ink)" }}
                      >
                        {correoGuardia}
                      </span>
                    </div>
                  ) : (
                    data?.guard?.id && (
                      <div
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t(
                          "usuarioDeAcceso.sinCorreoFicha",
                          "Sin correo: la invitación no se envía, te damos el enlace para compartirlo.",
                        )}
                      </div>
                    )
                  )}
                  {(correoGuardia || data?.guard?.id) && (
                    <Button
                      className="mt-1 w-full"
                      disabled={sendingInvite}
                      variant="brand"
                      onClick={handleSendAppAccess}
                    >
                      {sendingInvite ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      {isActivated
                        ? t("guards.profile.access.resendInvite") ||
                          "Reenviar invitación"
                        : t("guards.profile.access.sendInvite") ||
                          "Enviar acceso"}
                    </Button>
                  )}
                </div>
              </Section>

              {/* Device */}
              <Section
                title={t("guards.profile.cards.deviceInfo") || "Dispositivo"}
              >
                <div className="grid grid-cols-2 gap-3">
                  <ReadField
                    label={
                      t("guards.profile.fields.deviceType") || "Plataforma"
                    }
                    value={data?.deviceInfo?.platform || data?.deviceType}
                  />
                  <ReadField
                    label={t("guards.profile.fields.deviceModel") || "Modelo"}
                    value={data?.deviceInfo?.model}
                  />
                  <ReadField
                    label={t("guards.profile.fields.osVersion") || "SO"}
                    value={data?.deviceInfo?.osVersion}
                  />
                  <ReadField
                    label={t("guards.profile.fields.appVersion") || "App"}
                    value={data?.deviceInfo?.appVersion}
                  />
                </div>
              </Section>

              {/* Licenses */}
              <Section
                title={t("guards.profile.cards.licenseDetails") || "Licencias"}
              >
                {licenciasDelPerfil.length > 0 ? (
                  <div className="space-y-3">
                    {licenciasDelPerfil.map((lic: ProfileLicense, idx: number) => (
                      /* Se repite → cristal plano. */
                      <div key={idx} className="glass-flat p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <ReadField
                            label={
                              t("guards.profile.fields.licenseType") || "Tipo"
                            }
                            value={lic.type}
                          />
                          <ReadField
                            label={
                              t("guards.profile.fields.licenseNumber") ||
                              "Número"
                            }
                            value={lic.number}
                          />
                          <ReadField
                            label={
                              t("guards.profile.fields.expiryDate") || "Vence"
                            }
                            value={
                              lic.expiryDate
                                ? soloFechaCivil(lic.expiryDate, {}, "")
                                : null
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("guards.profile.noLicense") ||
                      "Sin licencias registradas."}
                  </p>
                )}
              </Section>
            </div>
          </div>
        </div>
        {compartir.dialogo}
      </GuardsLayout>
    </AppLayout>
  );
}
