/**
 * Service type definitions for "Puestos de Vigilancia".
 * Each type drives what fields are shown, what operations are available,
 * and how the post site is displayed across the UI.
 */

/** Known built-in values. The field also accepts any free-text string for custom types. */
export type ServiceTypeValue =
  | 'manned'
  | 'alarm'
  | 'cctv'
  | 'patrol'
  | 'custody'
  | (string & {});

export interface ServiceTypeDefinition {
  value: ServiceTypeValue;
  label: string;        // display name (Spanish)
  /** Clave i18n del rótulo. Se traduce donde se pinta (nunca aquí: esto es
   *  una constante de módulo y `t()` congelaría el idioma de arranque). */
  labelKey: string;
  descriptionKey: string;
  labelEn: string;      // display name (English)
  description: string;  // short description for the picker
  color: string;        // Tailwind bg color class
  textColor: string;    // Tailwind text color class
  borderColor: string;  // Tailwind border color class
  badgeBg: string;      // Tailwind badge background
  badgeText: string;    // Tailwind badge text
  icon: string;         // lucide icon name
}

export const SERVICE_TYPES: ServiceTypeDefinition[] = [
  {
    value: 'manned',
    label: 'Vigilancia con Vigilantes',
    labelKey: 'serviceTypes.manned',
    descriptionKey: 'serviceTypes.manned_desc',
    labelEn: 'Manned Guarding',
    description: 'Vigilantes de seguridad asignados al puesto de forma permanente o por turno.',
    color: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-300',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    icon: 'Shield',
  },
  {
    value: 'alarm',
    label: 'Alarma y Respuesta',
    labelKey: 'serviceTypes.alarm',
    descriptionKey: 'serviceTypes.alarm_desc',
    labelEn: 'Alarm Response',
    description: 'Monitoreo de alarmas y respuesta rápida ante eventos de seguridad.',
    color: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-300',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-800',
    icon: 'BellAlert',
  },
  {
    value: 'cctv',
    label: 'Videovigilancia',
    labelKey: 'serviceTypes.cctv',
    descriptionKey: 'serviceTypes.cctv_desc',
    labelEn: 'CCTV Monitoring',
    description: 'Monitoreo remoto mediante cámaras y circuito cerrado de televisión.',
    color: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-300',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    icon: 'Camera',
  },
  {
    value: 'patrol',
    label: 'Patrulla Móvil',
    labelKey: 'serviceTypes.patrol',
    descriptionKey: 'serviceTypes.patrol_desc',
    labelEn: 'Mobile Patrol',
    description: 'Supervisores que realizan rondas periódicas en una o varias instalaciones.',
    color: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-300',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    icon: 'Car',
  },
  {
    value: 'custody',
    label: 'Custodia y Escolta',
    labelKey: 'serviceTypes.custody',
    descriptionKey: 'serviceTypes.custody_desc',
    labelEn: 'Custody & Escort',
    description: 'Protección personal o custodia de bienes de alto valor.',
    color: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    icon: 'Lock',
  },
];

export const SERVICE_TYPE_MAP = new Map<ServiceTypeValue, ServiceTypeDefinition>(
  SERVICE_TYPES.map((st) => [st.value, st]),
);

export function getServiceType(value?: string | null): ServiceTypeDefinition | undefined {
  if (!value) return undefined;
  return SERVICE_TYPE_MAP.get(value as ServiceTypeValue);
}
