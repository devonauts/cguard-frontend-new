import api from "@/lib/api";
import securityGuardService from "@/lib/api/securityGuardService";

/**
 * Uploads files and links them to an incident (attachments table, notableType
 * «incident»; the detail lists them). Returns the names of the files that did
 * not make it, so the caller can SAY so: the create form used to show only
 * «Incidente creado» while the photo was lost.
 */
export async function uploadIncidentAttachments(
  tenantId: string,
  incidentId: string,
  files: File[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];

  for (const f of files) {
    try {
      const uploaded = await securityGuardService.uploadFileToStorage(
        f,
        "notesImages",
      );

      await api.post(`/tenant/${tenantId}/attachments`, {
        name: uploaded.name || f.name,
        mimeType: f.type || "application/octet-stream",
        sizeInBytes: uploaded.sizeInBytes || f.size,
        storageId: "notesImages",
        fileToken: uploaded.fileToken || null,
        // Without one of the two the server refuses the record (400).
        privateUrl: uploaded.fileToken ? null : uploaded.privateUrl || null,
        publicUrl: uploaded.publicUrl || null,
        notableType: "incident",
        notableId: incidentId,
      });
    } catch (e) {
      console.warn("Failed to upload/create attachment for incident", e);
      failed.push(f.name);
    }
  }

  return { failed };
}
