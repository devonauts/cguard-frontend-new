export interface GuardUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  avatar?: Array<{ downloadUrl?: string; publicUrl?: string }>;
}
export type GuardStatusRaw =
  | "active"
  | "archived"
  | "invited"
  | "pending"
  | string;
export interface SecurityGuard {
  id: string;
  fullName?: string;
  governmentId?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  status?: GuardStatusRaw;
  isOnDuty?: boolean;
  guardType?: string;
  skills?: unknown;
  stationId?: string;
  guardId?: string;
  guard?: GuardUser;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}
