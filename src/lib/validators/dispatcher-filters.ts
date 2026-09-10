import { z } from "zod";

export const dispatcherFiltersSchema = z.object({
  // Make clientId and siteId optional so filters can be applied without them
  clientId: z.string().optional(),
  stationId: z.string().optional(),
  siteId: z.string().optional(),
  status: z.enum(["todo", "abierto", "en_proceso", "cerrado"]).default("todo"),
  // New: single-date filters
  createdDate: z.string().optional(), // YYYY-MM-DD
  incidentDate: z.string().optional(), // YYYY-MM-DD
  includeArchived: z.boolean().default(false),
});

export type DispatcherFilters = z.infer<typeof dispatcherFiltersSchema>;

export const defaultDispatcherFilters: DispatcherFilters = {
  clientId: "",
  stationId: "",
  siteId: "",
  status: "todo",
  createdDate: undefined,
  incidentDate: undefined,
  includeArchived: false,
};
