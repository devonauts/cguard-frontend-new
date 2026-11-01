import i18n from "@/i18n";
import { ApiService } from "./api/apiService";
import { notifyDesktopSessionUpdated } from "@/lib/desktop";

import {
  crearLecturaCompartida,
  type LectorCompartido,
} from "@/lib/lecturaCompartida";

/**
 * DEDUPLICACIÓN DE `findById` — con una ventana muy corta, no una caché.
 *
 * El armazón pide la empresa DOS veces al arrancar la sesión: `app-layout.tsx`
 * para cachear ubicación/país/huso, y `sidebar.tsx` para el nombre y el
 * logotipo. Son dos efectos distintos que montan a la vez, así que salían dos
 * `GET /tenant/:id` idénticas con milisegundos de diferencia. Y hay más
 * llamantes (el centro de control, el perfil de empresa) que pueden coincidir.
 *
 * Compartir SÓLO la promesa en vuelo resultó ser demasiado frágil: al quitar
 * las dos peticiones sobrantes de `/auth/me` el arranque se volvió más rápido,
 * los dos efectos dejaron de solaparse —127 ms de separación, medido— y la
 * segunda petición reapareció. Una deduplicación que depende de que dos efectos
 * caigan en el mismo tic no es una deduplicación: es una carrera que suele
 * salir bien.
 *
 * Por eso ahora también se comparte el RESULTADO, pero durante dos segundos:
 * cubre de sobra un arranque y es demasiado poco para que nadie vea un dato
 * viejo. Y sigue habiendo escape: el perfil de empresa lee justo después de
 * guardar, así que `update()` olvida lo leído y `findById(id, true)` fuerza una
 * lectura de verdad. Eso era lo que protegía el comentario anterior.
 */
const VENTANA_MS = 2_000;
const lectores = new Map<string, LectorCompartido<any>>();

function lectorDe(id: string): LectorCompartido<any> {
  let l = lectores.get(id);

  if (!l) {
    l = crearLecturaCompartida(
      () => ApiService.get(`/tenant/${id}`),
      VENTANA_MS,
    );
    lectores.set(id, l);
  }

  return l;
}

/** Olvida lo leído de una empresa (o de todas). Tras guardar, o al cerrar sesión. */
export function olvidarEmpresa(id?: string): void {
  if (id) lectores.get(id)?.olvidar();
  else lectores.clear();
}

const tenantService = {
  create(data: any) {
    return ApiService.post("/tenant", { data });
  },
  update(id: string, data: any) {
    // Guardar invalida lo leído: el perfil de empresa relee justo después.
    olvidarEmpresa(id);

    return ApiService.put(`/tenant/${id}`, { data });
  },
  list(query = "") {
    return ApiService.get(`/tenant${query ? `?${query}` : ""}`);
  },
  /** `forzar` salta la ventana: para releer tras guardar. */
  findById(id: string, forzar = false) {
    const l = lectorDe(id);

    if (forzar) l.olvidar();

    return l.leer();
  },
  findByUrl(url: string) {
    return ApiService.get(`/tenant/url?url=${encodeURIComponent(url)}`);
  },
  async acceptInvitation(token: string, force = false) {
    const response = await ApiService.post(
      `/tenant/invitation/${token}/accept`,
      {
        data: { forceAcceptOtherEmail: force },
      },
    );

    // ✅ NUEVO: Si el backend devuelve un nuevo token + usuario, actualizarlos
    // Esto permite que el usuario tenga permisos inmediatamente sin cerrar sesión
    if (response && response.token) {
      try {
        // Guardar el nuevo token en localStorage
        localStorage.setItem("authToken", response.token);
        // Desktop app: the shell keeps the session across launches.
        notifyDesktopSessionUpdated(response.token);

        // Actualizar el usuario en el estado si está disponible
        if (response.user) {
          // El componente que llame a esto debería refrescar la app o redirigir
          // para que el AuthContext recargue automáticamente con el nuevo token
          console.log(
            "✅ Nuevo token recibido. Usuario actualizado con permisos del tenant.",
          );
        }
      } catch (e) {
        console.warn(
          "Error actualizando token después de aceptar invitación:",
          e,
        );
      }
    }

    return response;
  },
  declineInvitation(token: string) {
    return ApiService.delete(`/tenant/invitation/${token}/decline`);
  },
  async uploadLogo(file: File, tenantId: string) {
    const filename = file.name;
    const creds: any = await ApiService.get(
      `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(
        filename,
      )}&storageId=settingsLogos`,
    );

    const uploadUrl = creds.uploadCredentials?.url;

    if (!uploadUrl) throw new Error(i18n.t("ui.apiService.urlDeCargaNoDisponible", "URL de carga no disponible"));

    const form = new FormData();

    form.append("filename", filename);
    form.append("file", file);

    const uploadResp = await fetch(uploadUrl, { method: "POST", body: form });

    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => null);

      throw new Error(i18n.t("ui.apiService.errorAlSubirArchivo", { defaultValue: "Error al subir el archivo ({{status}}) {{detalle}}", status: uploadResp.status, detalle: text }).trim());
    }

    const fileObj = {
      new: true,
      name: filename,
      sizeInBytes: file.size,
      privateUrl: creds.privateUrl,
      publicUrl: creds.uploadCredentials?.publicUrl ?? null,
    };
    // Ensure we include existing theme (backend requires `settings.theme`)
    let theme = "default";

    try {
      const tenantResp: any = await ApiService.get(`/tenant/${tenantId}`);
      const t =
        tenantResp && (tenantResp.data || tenantResp.tenant)
          ? tenantResp.data || tenantResp.tenant
          : tenantResp;

      theme = t?.settings?.theme || t?.theme || theme;
    } catch (e) {
      // ignore and fallback to default
    }

    olvidarEmpresa(tenantId);

    return ApiService.put(`/tenant/${tenantId}/settings`, {
      settings: { logos: [fileObj], theme },
    });
  },
  destroy(ids: string[] = []) {
    return ApiService.delete(`/tenant?ids=${ids.join(",")}`);
  },

  /**
   * Sube un documento legal para la empresa (tenant).
   * Asocia el archivo al tenant bajo 'legalDocuments'.
   */
  uploadLegalDocument: async function (file: File, tenantId: string) {
    const filename = file.name;
    // Solicita credenciales de subida para este archivo
    const creds: any = await ApiService.get(
      `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=legalDocuments`,
    );

    const uploadUrl = creds.uploadCredentials?.url;

    if (!uploadUrl) throw new Error(i18n.t("ui.apiService.urlDeCargaNoDisponible", "URL de carga no disponible"));

    const form = new FormData();

    form.append("filename", filename);
    form.append("file", file);

    const uploadResp = await fetch(uploadUrl, { method: "POST", body: form });

    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => null);

      throw new Error(i18n.t("ui.apiService.errorAlSubirArchivo", { defaultValue: "Error al subir el archivo ({{status}}) {{detalle}}", status: uploadResp.status, detalle: text }).trim());
    }

    // Componer objeto archivo para asociar en backend
    const fileObj = {
      new: true,
      name: filename,
      sizeInBytes: file.size,
      privateUrl: creds.privateUrl,
      publicUrl: creds.uploadCredentials?.publicUrl ?? null,
    };

    // QA-86: the backend REPLACES the list with what it receives, so sending
    // only the new file deleted every earlier document. The current list is
    // read right before writing (not from the screen's state, which may be
    // stale) and the new file is appended to it.
    const current = await tenantService.listLegalDocuments(tenantId);

    olvidarEmpresa(tenantId);

    return ApiService.put(`/tenant/${tenantId}/settings`, {
      settings: {
        legalDocuments: [
          ...current.map((doc: { id: string }) => ({ id: doc.id })),
          fileObj,
        ],
      },
    });
  },

  /**
   * Removes ONE legal document: the list is written back without it (the
   * backend deletes whatever is no longer listed).
   */
  removeLegalDocument: async function (tenantId: string, documentId: string) {
    const current = await tenantService.listLegalDocuments(tenantId);

    olvidarEmpresa(tenantId);

    return ApiService.put(`/tenant/${tenantId}/settings`, {
      settings: {
        legalDocuments: current
          .filter((doc: { id: string }) => doc.id !== documentId)
          .map((doc: { id: string }) => ({ id: doc.id })),
      },
    });
  },

  /**
   * The company's legal documents. They hang from the tenant's SETTINGS
   * (`/settings` fills them with their download URL); the tenant record
   * itself never carried them, so the list always came back empty (QA-86).
   */
  listLegalDocuments: async function (tenantId: string) {
    const res: any = await ApiService.get(`/tenant/${tenantId}/settings`);
    const data = res && res.data && !Array.isArray(res.data) ? res.data : res;

    return Array.isArray(data?.legalDocuments) ? data.legalDocuments : [];
  },
};

export default tenantService;
