import { ApiService } from './api/apiService';

const tenantService = {
  create(data: any) {
    return ApiService.post('/tenant', { data });
  },
  update(id: string, data: any) {
    return ApiService.put(`/tenant/${id}`, { data });
  },
  list(query = '') {
    return ApiService.get(`/tenant${query ? `?${query}` : ''}`);
  },
  findById(id: string) {
    return ApiService.get(`/tenant/${id}`);
  },
  findByUrl(url: string) {
    return ApiService.get(`/tenant/url?url=${encodeURIComponent(url)}`);
  },
  async acceptInvitation(token: string, force = false) {
    const response = await ApiService.post(`/tenant/invitation/${token}/accept`, {
      data: { forceAcceptOtherEmail: force },
    });
    
    // ✅ NUEVO: Si el backend devuelve un nuevo token + usuario, actualizarlos
    // Esto permite que el usuario tenga permisos inmediatamente sin cerrar sesión
    if (response && response.token) {
      try {
        // Guardar el nuevo token en localStorage
        localStorage.setItem('authToken', response.token);
        
        // Actualizar el usuario en el estado si está disponible
        if (response.user) {
          // El componente que llame a esto debería refrescar la app o redirigir
          // para que el AuthContext recargue automáticamente con el nuevo token
          console.log('✅ Nuevo token recibido. Usuario actualizado con permisos del tenant.');
        }
      } catch (e) {
        console.warn('Error actualizando token después de aceptar invitación:', e);
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
    if (!uploadUrl) throw new Error('Upload URL not available');

    const form = new FormData();
    form.append('filename', filename);
    form.append('file', file);

    const uploadResp = await fetch(uploadUrl, { method: 'POST', body: form });
    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => null);
      throw new Error(`Upload failed: ${uploadResp.status} ${text}`);
    }

    const fileObj = {
      new: true,
      name: filename,
      sizeInBytes: file.size,
      privateUrl: creds.privateUrl,
      publicUrl: creds.uploadCredentials?.publicUrl ?? null,
    };
    // Ensure we include existing theme (backend requires `settings.theme`)
    let theme = 'default';
    try {
      const tenantResp: any = await ApiService.get(`/tenant/${tenantId}`);
      const t = (tenantResp && (tenantResp.data || tenantResp.tenant)) ? (tenantResp.data || tenantResp.tenant) : tenantResp;
      theme = t?.settings?.theme || t?.theme || theme;
    } catch (e) {
      // ignore and fallback to default
    }

    return ApiService.put(`/tenant/${tenantId}/settings`, { settings: { logos: [fileObj], theme } });
  },
  destroy(ids: string[] = []) {
    return ApiService.delete(`/tenant?ids=${ids.join(',')}`);
  },

  /**
   * Sube un documento legal para la empresa (tenant).
   * Asocia el archivo al tenant bajo 'legalDocuments'.
   */
  uploadLegalDocument: async function (file: File, tenantId: string) {
    const filename = file.name;
    // Solicita credenciales de subida para este archivo
    const creds: any = await ApiService.get(
      `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=legalDocuments`
    );

    const uploadUrl = creds.uploadCredentials?.url;
    if (!uploadUrl) throw new Error('Upload URL not available');

    const form = new FormData();
    form.append('filename', filename);
    form.append('file', file);

    const uploadResp = await fetch(uploadUrl, { method: 'POST', body: form });
    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => null);
      throw new Error(`Upload failed: ${uploadResp.status} ${text}`);
    }

    // Componer objeto archivo para asociar en backend
    const fileObj = {
      new: true,
      name: filename,
      sizeInBytes: file.size,
      privateUrl: creds.privateUrl,
      publicUrl: creds.uploadCredentials?.publicUrl ?? null,
    };

    // Actualizar documentos legales del tenant (agregar)
    return ApiService.put(`/tenant/${tenantId}/settings`, { settings: { legalDocuments: [fileObj] } });
  },

  /**
   * Lista todos los documentos legales de un tenant (empresa).
   * Asume que el backend retorna un array 'legalDocuments' en el objeto tenant.
   */
  listLegalDocuments: async function (tenantId: string) {
    const res: any = await ApiService.get(`/tenant/${tenantId}`);
    // Devuelve array vacío si no existe
    return res?.legalDocuments || [];
  },
};

export default tenantService;
