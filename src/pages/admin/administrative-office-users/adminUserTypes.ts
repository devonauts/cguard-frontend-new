// Shared shapes for the administrative-office-users pages. The underlying user
// record is the shared `UserCurrent` model (which carries a `[k: string]: any`
// index signature, so arbitrary field probing stays safe); these helpers add
// precise shapes for the parts these pages actually branch on.

import type { UserCurrent, TenantUser } from "@/types/api";

export type AdminUser = UserCurrent;
export type { TenantUser };

/** A role reference, which the API may return as a bare slug or an object. */
export type RoleRef =
  string | { id?: string; name?: string; slug?: string; role?: string };

/** Per-user permission overrides layered on top of the base role. */
export interface PermissionOverrides {
  grant?: string[];
  deny?: string[];
}

/** A selectable option (client / post-site / role) in the user forms. */
export interface Option {
  id: string;
  name: string;
  slug?: string;
}

/** A client-account option. */
export interface ClientOption {
  id: string;
  name: string;
}

/** A post-site option, optionally scoped to one or more clients. */
export interface PostSiteOption {
  id: string;
  name: string;
  clientId?: string;
  clientIds?: string[];
}

/** A station option under a post-site. */
export interface StationOption {
  id: string;
  name: string;
  postSiteId?: string | null;
}

/** A role option for the role picker. */
export interface RoleOption {
  id: string;
  name: string;
  slug?: string;
}
