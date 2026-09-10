import api from '@/lib/api';
import { securityGuardService } from '@/lib/api/securityGuardService';

const getTenantId = (): string => {
  if (typeof window !== 'undefined') {
    const tenantId = localStorage.getItem('tenantId');
    if (tenantId) {
      return tenantId;
    }
  }
  throw new Error('TenantId not found. Please log in first.');
};

const uploadFile = async (file: File | null, storageId: string) => {
  if (!file) {
    return undefined;
  }
  const uploaded = await securityGuardService.uploadFileToStorage(file, storageId);
  return uploaded;
};

const resourceUrl = (resource: string) => {
  const tenantId = getTenantId();
  return `/tenant/${tenantId}/${resource}`;
};

/** Qué del vigilante ve el cliente en Mi Seguridad. Ausente = todo visible. */
export interface CustomerGuardVisibility {
  name: boolean;
  photo: boolean;
  document: boolean;
  address: boolean;
  email: boolean;
  phone: boolean;
}

export async function getCustomerGuardVisibility(): Promise<CustomerGuardVisibility> {
  const { data } = await api.get(resourceUrl('settings'));
  const v = (data && (data as any).customerGuardVisibility) || {};
  // Default a visible (comportamiento actual) cuando la clave no existe.
  return {
    name: v.name !== false,
    photo: v.photo !== false,
    document: v.document !== false,
    address: v.address !== false,
    email: v.email !== false,
    phone: v.phone !== false,
  };
}

export async function saveCustomerGuardVisibility(
  vis: CustomerGuardVisibility,
): Promise<void> {
  // El settings PUT fusiona por columna, así que enviar solo esta clave no
  // toca logo, tema ni el resto de la configuración.
  await api.put(resourceUrl('settings'), {
    settings: {
      customerGuardVisibility: {
        name: !!vis.name,
        photo: !!vis.photo,
        document: !!vis.document,
        address: !!vis.address,
        email: !!vis.email,
        phone: !!vis.phone,
      },
    },
  });
}

export async function listBanners() {
  const { data } = await api.get(resourceUrl('banner-superior-app'));
  return data?.rows ?? [];
}

export async function createBanner(data: Record<string, unknown>) {
  const { data: response } = await api.post(resourceUrl('banner-superior-app'), { data });
  return response;
}

export async function updateBanner(id: string, data: Record<string, unknown>) {
  const { data: response } = await api.put(resourceUrl(`banner-superior-app/${id}`), { data });
  return response;
}

export async function deleteBanner(id: string) {
  await api.delete(resourceUrl('banner-superior-app'), {
    params: { ids: [id] },
  });
}

export async function listCertifications() {
  const { data } = await api.get(resourceUrl('certification'));
  return data?.rows ?? [];
}

export async function listServices() {
  const { data } = await api.get(resourceUrl('service'));
  return data?.rows ?? [];
}

export async function updateService(id: string, data: Record<string, unknown>) {
  const { data: response } = await api.put(resourceUrl(`service/${id}`), { data });
  return response;
}

export async function createService(data: Record<string, unknown>) {
  const { data: response } = await api.post(resourceUrl('service'), { data });
  return response;
}

export async function deleteService(id: string) {
  await api.delete(resourceUrl('service'), {
    params: { ids: [id] },
  });
}

export async function createCertification(data: Record<string, unknown>) {
  const { data: response } = await api.post(resourceUrl('certification'), { data });
  return response;
}

export async function updateCertification(id: string, data: Record<string, unknown>) {
  const { data: response } = await api.put(resourceUrl(`certification/${id}`), { data });
  return response;
}

export async function deleteCertification(id: string) {
  await api.delete(resourceUrl('certification'), {
    params: { ids: [id] },
  });
}

export async function uploadBannerImage(file: File | null) {
  return uploadFile(file, 'bannerSuperiorAppImageUrl');
}

export async function uploadServiceImage(file: File | null) {
  return uploadFile(file, 'serviceServiceImages');
}

export async function uploadCertificationImage(file: File | null) {
  return uploadFile(file, 'certificationImage');
}

export async function uploadCertificationIcon(file: File | null) {
  return uploadFile(file, 'certificationIcon');
}
