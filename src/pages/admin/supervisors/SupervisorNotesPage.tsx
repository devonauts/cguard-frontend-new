import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import GuardNotes from "@/pages/admin/security-guards/components/GuardNotes/GuardNotespage";
import api from "@/lib/api";

/**
 * Supervisor "Notas" tab — REUSES the guard notes page, injecting a supervisor
 * notes adapter (same polymorphic backend, keyed by the supervisor user id) and
 * the supervisor sidebar. Guard usage of GuardNotes is unchanged (it passes none
 * of these props).
 */
export default function SupervisorNotesPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const tid = localStorage.getItem("tenantId") || "";
  const notesApi = {
    list: (uid: string) =>
      api.get(`/tenant/${tid}/supervisors/${uid}/notes`).then((r) => r.data),
    create: (uid: string, payload: unknown) =>
      api
        .post(`/tenant/${tid}/supervisors/${uid}/notes`, payload)
        .then((r) => r.data),
  };

  return (
    <GuardNotes
      entityId={id}
      navKey="supervisors"
      notesApi={notesApi}
      title={t("comun.notas", "Notas")}
    />
  );
}
