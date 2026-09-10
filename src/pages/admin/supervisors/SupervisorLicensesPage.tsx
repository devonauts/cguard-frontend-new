import { useParams } from "react-router-dom";

import GuardLicenses from "@/pages/admin/security-guards/components/GuardLicenses/GuardLicensespage";
import api from "@/lib/api";

/**
 * Supervisor "Licencias" tab — REUSES the guard licenses page, injecting a
 * supervisor licenses adapter (new supervisorLicense model, user-keyed) + the
 * supervisor sidebar. Guard usage of GuardLicenses is unchanged.
 */
export default function SupervisorLicensesPage() {
  const { id = "" } = useParams();
  const tid = localStorage.getItem("tenantId") || "";
  const base = `/tenant/${tid}/supervisors/${id}/licenses`;

  const licensesApi = {
    list: (pg: { limit?: number; offset?: number }) =>
      api
        .get(`${base}?limit=${pg?.limit ?? 25}&offset=${pg?.offset ?? 0}`)
        .then((r) => r.data),
    // No single-GET endpoint — derive from the list (rows already carry images).
    get: (licenseId: string) =>
      api
        .get(base)
        .then(
          (r) =>
            (r.data?.rows || []).find(
              (x: { id: string }) => x.id === licenseId,
            ) || null,
        ),
    create: (payload: unknown) =>
      api.post(base, payload).then((r) => r.data?.data ?? r.data),
    update: (licenseId: string, payload: unknown) =>
      api
        .put(`${base}/${licenseId}`, payload)
        .then((r) => r.data?.data ?? r.data),
    remove: (ids: string[]) =>
      Promise.all((ids || []).map((lid) => api.delete(`${base}/${lid}`))),
    // No PDF report for supervisors (yet).
    download: (_licenseId: string) =>
      Promise.reject(new Error("Reporte no disponible")),
  };

  return (
    <GuardLicenses
      licensesApi={licensesApi}
      navKey="supervisors"
      title="Licencias"
    />
  );
}
