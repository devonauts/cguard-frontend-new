// Canonical PostSite type (copied verbatim from src/lib/api/postSiteService.ts).
export interface PostSite {
  id: string;
  name: string;
  clientId: string;
  client?: { id: string; name: string };
  address: string;
  email?: string;
  phone?: string;
  fax?: string;
  categoryId?: string;
  category?: { id: string; name: string };
  status: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
  // Extended backend fields
  companyName?: string;
  description?: string;
  contactPhone?: string;
  contactEmail?: string;
  categoryIds?: string[] | null;
  // Station-specific frontend fields
  latitud?: string | number;
  longitud?: string | number;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
  assignedGuards?: any[];
  guardsCount?: number;
  numberOfGuardsInStation?: string | number | null;
}
