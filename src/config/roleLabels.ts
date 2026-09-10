import i18n from "@/i18n";

/**
 * Localized display names + descriptions for the BUILT-IN roles. The backend
 * stores/returns raw identifiers ("operationsManager") and English seed
 * descriptions; the UI must render them in the user's chosen language.
 * Custom (tenant-created) roles are user-authored text and render as stored.
 */
type Localized = { es: string; en: string; pt: string } & Partial<
  Record<"de" | "fr" | "it" | "pl" | "nl", string>
>;

const ROLE_NAMES: Record<string, Localized> = {
  admin: {
    es: "Administrador",
    en: "Administrator",
    pt: "Administrador",
    de: "Administrator",
    fr: "Administrateur",
    it: "Amministratore",
    pl: "Administrator",
    nl: "Beheerder",
  },
  superadmin: {
    es: "Superadministrador",
    en: "Super Administrator",
    pt: "Superadministrador",
    de: "Superadministrator",
    fr: "Super-administrateur",
    it: "Super amministratore",
    pl: "Superadministrator",
    nl: "Superbeheerder",
  },
  customer: {
    es: "Cliente",
    en: "Customer",
    pt: "Cliente",
    de: "Auftraggeber",
    fr: "Client",
    it: "Committente",
    pl: "Zleceniodawca",
    nl: "Opdrachtgever",
  },
  securityguard: {
    es: "Vigilante",
    en: "Security Guard",
    pt: "Vigilante",
    de: "Sicherheitskraft",
    fr: "Agent de sécurité",
    it: "Guardia giurata",
    pl: "Pracownik ochrony",
    nl: "Beveiliger",
  },
  securitysupervisor: {
    es: "Supervisor de Seguridad",
    en: "Security Supervisor",
    pt: "Supervisor de Segurança",
    de: "Einsatzleiter",
    fr: "Superviseur sécurité",
    it: "Supervisore",
    pl: "Nadzorca ochrony",
    nl: "Beveiligingssupervisor",
  },
  operationsmanager: {
    es: "Gerente de Operaciones",
    en: "Operations Manager",
    pt: "Gerente de Operações",
    de: "Betriebsleiter",
    fr: "Responsable d'exploitation",
    it: "Responsabile operativo",
    pl: "Kierownik operacyjny",
    nl: "Operationeel manager",
  },
  hrmanager: {
    es: "Gerente de RR.HH.",
    en: "HR Manager",
    pt: "Gerente de RH",
    de: "Personalleiter",
    fr: "Responsable RH",
    it: "Responsabile risorse umane",
    pl: "Kierownik HR",
    nl: "HR-manager",
  },
  dispatcher: {
    es: "Despachador",
    en: "Dispatcher",
    pt: "Despachante",
    de: "Disponent",
    fr: "Répartiteur",
    it: "Operatore di centrale",
    pl: "Dyspozytor",
    nl: "Meldkamermedewerker",
  },
  // El vigilante que cubre la consola. Rol propio y editable: hasta ahora
  // heredaba el juego del despachador y no aparecía en ninguna lista, así que
  // no había dónde ajustarle los permisos.
  centraloperator: {
    es: "Operador de Central",
    en: "Central Operator",
    pt: "Operador de Central",
    de: "Leitstellenoperator",
    fr: "Opérateur de PC sécurité",
    it: "Operatore centrale operativa",
    pl: "Operator centrali",
    nl: "Meldkameroperator",
  },
  clientaccountmanager: {
    es: "Gestor de Cuentas",
    en: "Client Account Manager",
    pt: "Gestor de Contas",
    de: "Kundenbetreuer",
    fr: "Chargé de clientèle",
    it: "Account manager",
    pl: "Opiekun klienta",
    nl: "Accountmanager",
  },
  administrativesupervisor: {
    es: "Supervisor Administrativo",
    en: "Administrative Supervisor",
    pt: "Supervisor Administrativo",
    de: "Verwaltungsleiter",
    fr: "Superviseur administratif",
    it: "Supervisore amministrativo",
    pl: "Kierownik administracji",
    nl: "Administratief supervisor",
  },
  administrativeassistant: {
    es: "Asistente Administrativo",
    en: "Administrative Assistant",
    pt: "Assistente Administrativo",
    de: "Verwaltungsassistenz",
    fr: "Assistant administratif",
    it: "Assistente amministrativo",
    pl: "Asystent administracyjny",
    nl: "Administratief medewerker",
  },
  secretary: {
    es: "Secretaría / Recepción",
    en: "Secretary / Reception",
    pt: "Secretária / Recepção",
    de: "Sekretariat / Empfang",
    fr: "Secrétariat / Accueil",
    it: "Segreteria / Reception",
    pl: "Sekretariat / Recepcja",
    nl: "Secretariaat / Receptie",
  },
};

const ROLE_DESCRIPTIONS: Record<string, Localized> = {
  admin: {
    es: "Administrador del sistema — acceso completo",
    en: "System administrator — full access",
    pt: "Administrador do sistema — acesso completo",
  },
  superadmin: {
    es: "Acceso global a la plataforma (interno)",
    en: "Global platform access (internal)",
    pt: "Acesso global à plataforma (interno)",
  },
  customer: {
    es: "Cliente — acceso a sus servicios asignados",
    en: "Customer — access to their assigned services",
    pt: "Cliente — acesso aos serviços atribuídos",
  },
  securityguard: {
    es: "Vigilante — rol operativo de campo",
    en: "Security guard — operational field role",
    pt: "Vigilante — função operacional de campo",
  },
  securitysupervisor: {
    es: "Supervisa vigilantes e incidentes",
    en: "Supervises guards and incidents",
    pt: "Supervisiona vigilantes e incidentes",
  },
  operationsmanager: {
    es: "Supervisa operaciones y clientes",
    en: "Oversees operations and clients",
    pt: "Supervisiona operações e clientes",
  },
  hrmanager: {
    es: "Gestiona personal y certificaciones",
    en: "Manages personnel and certifications",
    pt: "Gerencia pessoal e certificações",
  },
  centraloperator: {
    es: "El vigilante que cubre la consola. Entra al CRM mientras tenga la central asignada; al quitársela, deja de entrar.",
    en: "The officer covering the console. Gets CRM access while assigned to the central station; loses it when unassigned.",
    pt: "O vigilante que cobre a consola. Entra no CRM enquanto tiver a central atribuída.",
  },
  dispatcher: {
    // La central de operaciones. Este rol dejó de ser «el que programa turnos»
    // cuando pasó a ser el de la consola 24/7. El centralista YA NO lo hereda:
    // tiene su propio rol «Operador de Central», editable por separado.
    es: "Central de operaciones: novedades, alarmas, radio, cobertura y despacho",
    en: "Operations center: incidents, alarms, radio, coverage and dispatch",
    pt: "Central de operações: ocorrências, alarmes, rádio, cobertura e despacho",
  },
  clientaccountmanager: {
    es: "Gestiona cuentas de clientes",
    en: "Manages client accounts",
    pt: "Gerencia contas de clientes",
  },
  administrativesupervisor: {
    es: "Supervisa al personal administrativo y la oficina",
    en: "Oversees administrative staff and office operations",
    pt: "Supervisiona a equipe administrativa e o escritório",
  },
  administrativeassistant: {
    es: "Apoyo de oficina y acceso administrativo",
    en: "Office support and administrative access",
    pt: "Apoio de escritório e acesso administrativo",
  },
  secretary: {
    es: "Recepción, control de visitas y coordinación de oficina",
    en: "Reception, visitor management, and office coordination",
    pt: "Recepção, controle de visitas e coordenação do escritório",
  },
};

/**
 * Idioma actual de la interfaz. Antes aplastaba a español cualquier cosa que no
 * fuera en/pt, así que un usuario alemán veía los roles en español. Ahora
 * devuelve el idioma real y la búsqueda cae, si falta, primero al inglés.
 */
export function uiLang(): keyof Localized {
  const l = String(i18n.language || "es")
    .slice(0, 2)
    .toLowerCase();

  return (["es", "en", "pt", "de", "fr", "it", "pl", "nl"] as const).includes(
    l as any,
  )
    ? (l as keyof Localized)
    : "es";
}

/** Toma el idioma pedido; si ese rol no lo tiene, inglés y por último español. */
function enIdioma(entry: Localized): string {
  return entry[uiLang()] || entry.en || entry.es;
}

const keyOf = (slugOrName?: string) =>
  String(slugOrName || "")
    .toLowerCase()
    .trim();

/** Display name for a role; built-ins localize, custom roles render as stored. */
export function roleDisplayName(slugOrName?: string): string {
  const entry = ROLE_NAMES[keyOf(slugOrName)];

  return entry ? enIdioma(entry) : String(slugOrName || "");
}

/** Display description; built-ins localize, custom roles keep their own text. */
export function roleDisplayDescription(
  slugOrName?: string,
  fallback?: string,
): string {
  const entry = ROLE_DESCRIPTIONS[keyOf(slugOrName)];

  return entry ? enIdioma(entry) : fallback || "";
}

export default { roleDisplayName, roleDisplayDescription, uiLang };
