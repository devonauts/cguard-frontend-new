import { ApiService } from "@/services/api/apiService";

const tid = (): string => localStorage.getItem("tenantId") || "";

export type RadioTransport = "udp" | "tcp" | "tls";
export type RadioDeviceStatus = "unknown" | "registered" | "offline" | "error";

export interface RadioDevice {
  id: string;
  name: string;
  host?: string | null;
  sipPort?: number | null;
  transport?: RadioTransport;
  sipUsername?: string | null;
  // sipPassword is never returned; these masked fields are:
  sipPasswordConfigured?: boolean;
  sipPasswordLast4?: string | null;
  sipDomain?: string | null;
  registerRequired?: boolean;
  extension?: string | null;
  codec?: string;
  rtpPortStart?: number | null;
  rtpPortEnd?: number | null;
  status?: RadioDeviceStatus;
  lastSeenAt?: string | null;
  lastError?: string | null;
  postSiteId?: string | null;
  stationId?: string | null;
  notes?: string | null;
  active?: boolean;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type RadioDeviceInput = Partial<RadioDevice> & { sipPassword?: string };

const unwrapRows = (
  r: RadioDevice[] | { rows?: RadioDevice[] },
): RadioDevice[] => (Array.isArray(r) ? r : (r?.rows ?? []));

export const radioDeviceService = {
  list(): Promise<RadioDevice[]> {
    return ApiService.get(`/tenant/${tid()}/radio-devices`).then(unwrapRows);
  },
  get(id: string): Promise<RadioDevice> {
    return ApiService.get(`/tenant/${tid()}/radio-device/${id}`);
  },
  create(body: RadioDeviceInput): Promise<RadioDevice> {
    return ApiService.post(`/tenant/${tid()}/radio-device`, body);
  },
  update(id: string, body: RadioDeviceInput): Promise<RadioDevice> {
    return ApiService.put(`/tenant/${tid()}/radio-device/${id}`, body);
  },
  remove(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/radio-device/${id}`);
  },
  test(
    id: string,
  ): Promise<{ requested: boolean; dispatched: boolean; device: RadioDevice }> {
    return ApiService.post(`/tenant/${tid()}/radio-device/${id}/test`);
  },
};

export default radioDeviceService;
