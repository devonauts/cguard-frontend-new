// Local, territory-specific types for the dispatcher (Incidentes) pages.
// Dispatch/incident rows come back from the backend in loosely-shaped forms
// (a related entity may arrive as a nested object OR as a bare id/name string),
// so the polymorphic fields are modelled as `string | Ref` unions and the code
// narrows with `typeof x === 'object'` before reading object properties.

/** A related entity (client or post-site) that may arrive as a nested object. */
export interface DispatchRef {
  id?: string;
  clientId?: string;
  siteId?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  companyName?: string;
  commercialName?: string;
  businessName?: string;
  address?: string;
}

/** A named sub-entity that only ever arrives as an object (never a bare string). */
export interface NamedEntity {
  id?: string;
  name?: string;
}

/** A single dispatch / incident row as consumed by the list + detail views. */
export interface DispatchRow {
  id: string;
  client?: string | DispatchRef;
  clientId?: string;
  clientName?: string;
  clientAccountId?: string;
  clientAccount?: { id?: string; clientId?: string };
  callerName?: string;
  callerType?: string | NamedEntity;
  guardName?: { fullName?: string; name?: string };
  site?: string | DispatchRef;
  siteId?: string;
  incidentType?: string | NamedEntity;
  incidentTypeId?: string;
  dateTime?: string;
  incidentAt?: string;
  /** Always set; the only date of incidents filed from the customer portal. */
  date?: string;
  status?: string;
  content?: string;
  description?: string;
  location?: string;
  internalNotes?: string;
  notes?: string;
  priority?: string;
  message?: string;
}

/**
 * A client / post-site / station option used to populate the filter dropdowns.
 * Sourced from several endpoints, hence the permissive set of optional id/name
 * aliases that the display/matching helpers probe.
 */
export interface DirectoryOption {
  id: string;
  name: string;
  lastName?: string;
  clientId?: string;
  clientAccountId?: string;
  clientAccount?: { id?: string; clientId?: string };
  client?: { id?: string; clientId?: string };
  uuid?: string;
  _id?: string;
  externalId?: string;
  code?: string;
  fullName?: string;
  displayName?: string;
  businessName?: string;
  stationName?: string;
  companyName?: string;
  address?: string;
  // Optional geo fields probed by the detail / printable views.
  //
  // `latitud`/`longitud` (en español) NO son un capricho: son los nombres que
  // devuelve de verdad `postSiteService.list`, y faltaban aquí. Sin declararlos,
  // toda sonda escrita contra este tipo miraba campos que nunca vienen.
  latitud?: string | number | null;
  longitud?: string | number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  lat?: string | number | null;
  lng?: string | number | null;
  locationLat?: string | number | null;
  locationLng?: string | number | null;
  location?: string;
  coords?: { lat?: string | number | null; lng?: string | number | null };
}

/** An attachment uploaded alongside a dispatch comment. */
export interface CommentAttachment {
  url?: string;
  name?: string;
}

/** A comment on a dispatch / incident (server-sourced or optimistic local). */
export interface DispatchComment {
  id?: string | number;
  text?: string;
  body?: string;
  message?: string;
  createdAt?: string;
  author?: {
    id?: string;
    name?: string;
    fullName?: string;
    username?: string;
  } | null;
  attachment?: CommentAttachment | null;
}

/** Loose shape of an error thrown by axios / the api wrapper. */
export interface DispatchApiError {
  status?: number;
  statusCode?: number;
  message?: string;
  data?: { status?: number };
  response?: { status?: number; data?: { message?: string } };
}
