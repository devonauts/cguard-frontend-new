// Client types matching backend structure

export interface Client {
  company?: string;
  fullName?: string;
  id: string;
  name: string;
  lastName?: string;
  commercialName?: string;
  personType?: string;
  email: string;
  phoneNumber: string;
  address: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  faxNumber?: string;
  website?: string;
  active?: boolean;
  categoryId?: string;
  category?: {
    id: string;
    name: string;
  };
  categoryIds?: string[];
  contractDate?: string;
  contractEndDate?: string;
  riskLevel?: string;
  onboardingStatus?: string;
  logoUrl?: Array<{ downloadUrl?: string; publicUrl?: string }> | string;
  placePictureUrl?:
    | Array<{ downloadUrl?: string; publicUrl?: string }>
    | string;
  purchaseOrder?: string;
  code?: string;
  accountExecutiveId?: string;
  documentNumber?: string;
  latitude?: string | number;
  longitude?: string | number;
  legalRepFirstName?: string;
  legalRepLastName?: string;
  legalRepEmail?: string;
  legalRepPhone?: string;
  legalRepDocument?: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ClientInput {
  name: string;
  lastName?: string;
  email: string;
  phoneNumber: string;
  address: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  faxNumber?: string;
  website?: string;
  active?: boolean;
  categoryId?: string;
  // Optional geographic coordinates (string or number accepted)
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface ClientFilters {
  name?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  country?: string;
  faxNumber?: string;
  website?: string;
  category?: string;
  active?: boolean;
  createdAtRange?: [string, string];
}

export interface PaginationParams {
  limit: number;
  offset: number;
  orderBy?: string;
}

export interface ClientListResponse {
  rows: Client[];
  count: number;
}

export interface Category {
  id: string;
  name: string;
}
