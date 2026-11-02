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
  brandadmin: {
    es: "Administrador de marca",
    en: "Brand Administrator",
    pt: "Administrador de marca",
    de: "Markenadministrator",
    fr: "Administrateur de marque",
    it: "Amministratore di marchio",
    pl: "Administrator marki",
    nl: "Merkbeheerder",
  },
  branchmanager: {
    es: "Gerente de sucursal",
    en: "Branch Manager",
    pt: "Gerente de filial",
    de: "Niederlassungsleitung",
    fr: "Responsable d’agence",
    it: "Responsabile di filiale",
    pl: "Kierownik oddziału",
    nl: "Vestigingsmanager",
  },
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
  // «Supervisor de oficina», not «Supervisor Administrativo»: next to the
  // field «Supervisores» section the old name read like a security supervisor.
  administrativesupervisor: {
    es: "Supervisor de oficina",
    en: "Office supervisor",
    pt: "Supervisor de escritório",
    de: "Büroleitung",
    fr: "Superviseur de bureau",
    it: "Supervisore d’ufficio",
    pl: "Kierownik biura",
    nl: "Kantoorsupervisor",
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
  brandadmin: {
    es: "Administra sus marcas con poderes de administrador: sus clientes, cotizaciones, facturas y el personal que trabaja en ellas, con su nómina. No paga, no crea marcas ni reparte roles, y todo lo que hace queda en la bitácora.",
    en: "Runs their brands with administrator powers: their clients, quotes, invoices and the staff who work there, payroll included. Can’t pay, create brands or hand out roles, and everything they do is logged.",
    pt: "Administra suas marcas com poderes de administrador: seus clientes, orçamentos, faturas e o pessoal que trabalha nelas, com a folha. Não paga, não cria marcas nem distribui funções, e tudo o que faz fica registrado.",
    de: "Leitet die eigenen Marken mit Administratorrechten: deren Kunden, Angebote, Rechnungen und das dort tätige Personal samt Lohnabrechnung. Kann nicht bezahlen, keine Marken anlegen und keine Rollen vergeben; alles wird protokolliert.",
    fr: "Gère ses marques avec des droits d’administrateur : leurs clients, devis, factures et le personnel qui y travaille, paie comprise. Ne peut ni payer, ni créer de marques, ni attribuer de rôles, et tout est journalisé.",
    it: "Gestisce i suoi marchi con poteri di amministratore: clienti, preventivi, fatture e il personale che vi lavora, buste paga incluse. Non paga, non crea marchi né assegna ruoli; tutto viene registrato.",
    pl: "Zarządza swoimi markami z uprawnieniami administratora: ich klientami, ofertami, fakturami i pracującym tam personelem wraz z płacami. Nie płaci, nie tworzy marek ani nie nadaje ról, a wszystko jest rejestrowane.",
    nl: "Beheert de eigen merken met beheerdersrechten: hun klanten, offertes, facturen en het personeel dat er werkt, inclusief loon. Kan niet betalen, geen merken aanmaken en geen rollen toekennen; alles wordt gelogd.",
  },
  branchmanager: {
    es: "Administra sus sucursales con poderes de administrador. No paga, no contrata módulos ni cierra la cuenta, y todo lo que hace queda en la bitácora.",
    en: "Runs their branches with administrator powers. Can’t pay, buy modules or close the account, and everything they do is logged.",
    pt: "Administra suas filiais com poderes de administrador. Não paga, não contrata módulos nem encerra a conta, e tudo o que faz fica registrado.",
    de: "Leitet die eigenen Niederlassungen mit Administratorrechten. Kann nicht bezahlen, keine Module kaufen und das Konto nicht schließen; alles wird protokolliert.",
    fr: "Gère ses agences avec des droits d’administrateur. Ne peut ni payer, ni acheter de modules, ni fermer le compte, et tout est journalisé.",
    it: "Gestisce le sue filiali con poteri di amministratore. Non paga, non acquista moduli e non chiude l’account; tutto viene registrato.",
    pl: "Zarządza swoimi oddziałami z uprawnieniami administratora. Nie płaci, nie kupuje modułów ani nie zamyka konta, a wszystko jest rejestrowane.",
    nl: "Beheert de eigen vestigingen met beheerdersrechten. Kan niet betalen, geen modules kopen en het account niet sluiten; alles wordt gelogd.",
  },
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
    es: "Coordina al personal de oficina. No es un supervisor de seguridad en campo: esos se agregan en Personal › Supervisores.",
    en: "Coordinates the office staff. Not a field security supervisor: add those in Staff › Supervisors.",
    pt: "Coordena a equipe do escritório. Não é um supervisor de segurança em campo: esses se adicionam em Pessoal › Supervisores.",
    de: "Koordiniert das Büropersonal. Keine Einsatzleitung im Außendienst: diese legst du unter Personal › Einsatzleiter an.",
    fr: "Coordonne le personnel de bureau. Ce n’est pas un superviseur de terrain : ceux-ci s’ajoutent dans Personnel › Superviseurs.",
    it: "Coordina il personale d’ufficio. Non è un supervisore di campo: quelli si aggiungono in Personale › Supervisori.",
    pl: "Koordynuje pracowników biura. To nie jest nadzorca ochrony w terenie: tych dodajesz w Personel › Nadzorcy.",
    nl: "Coördineert het kantoorpersoneel. Geen beveiligingssupervisor in het veld: die voeg je toe onder Personeel › Supervisors.",
  },
  administrativeassistant: {
    es: "Apoyo de oficina: consulta y registra lo del día a día, sin cambiar la configuración de la empresa.",
    en: "Office support: views and records the day-to-day work, without changing the company settings.",
    pt: "Apoio de escritório: consulta e registra o dia a dia, sem mudar a configuração da empresa.",
    de: "Büroassistenz: sieht und erfasst das Tagesgeschäft, ohne die Unternehmenseinstellungen zu ändern.",
    fr: "Assistance de bureau : consulte et enregistre le quotidien, sans modifier les paramètres de l’entreprise.",
    it: "Supporto d’ufficio: consulta e registra il lavoro quotidiano, senza cambiare le impostazioni dell’azienda.",
    pl: "Wsparcie biura: przegląda i rejestruje bieżącą pracę, bez zmiany ustawień firmy.",
    nl: "Kantoorondersteuning: bekijkt en registreert het dagelijkse werk, zonder de bedrijfsinstellingen te wijzigen.",
  },
  secretary: {
    es: "Recepción, control de visitas y coordinación de oficina",
    en: "Reception, visitor management, and office coordination",
    pt: "Recepção, controle de visitas e coordenação do escritório",
    de: "Empfang, Besucherverwaltung und Bürokoordination",
    fr: "Accueil, gestion des visiteurs et coordination du bureau",
    it: "Reception, gestione dei visitatori e coordinamento dell’ufficio",
    pl: "Recepcja, obsługa gości i koordynacja biura",
    nl: "Receptie, bezoekersbeheer en kantoorcoördinatie",
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
