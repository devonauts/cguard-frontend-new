import { ApiService } from "@/services/api/apiService";

const tid = (): string => localStorage.getItem("tenantId") || "";

export type DeviceType = "dvr" | "nvr" | "camera" | "cloud";
export type DeviceProtocol = "rtsp" | "onvif" | "hls" | "webrtc";
export type DeviceStatus =
  | "online"
  | "offline"
  | "unknown"
  | "auth_failed"
  | "unreachable";

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  brand?: string | null;
  model?: string | null;
  host?: string | null;
  port?: number | null;
  httpPort?: number | null;
  username?: string | null;
  // NOTE: password is never returned by the API (omitted server-side).
  channels?: number | null;
  protocol?: DeviceProtocol;
  status?: DeviceStatus;
  lastSeenAt?: string | null;
  postSiteId?: string | null;
  stationId?: string | null;
  notes?: string | null;
  active?: boolean;
  streamGatewayBase?: string | null;
  streamFormat?: "hls" | "webrtc";
  // 'direct' = pull RTSP from host; 'relay' = streamed in via a remote site relay.
  connectionMode?: "direct" | "relay";
  relaySiteId?: string | null;
  tenantId?: string;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RelaySite {
  id: string;
  name: string;
  siteKey: string;
  // publishToken is never returned; these masked fields are:
  publishTokenConfigured?: boolean;
  publishTokenLast4?: string | null;
  ingestProtocol?: "rtmps" | "srt";
  status?: "unknown" | "publishing" | "offline";
  lastSeenAt?: string | null;
  notes?: string | null;
  active?: boolean;
  tenantId?: string;
  createdAt?: string;
}

export interface RelayBundle {
  siteId: string;
  siteKey: string;
  ingest: string;
  channelCount: number;
  tokenEmbedded: boolean;
  compose: string;
}

export type CameraStatus = "online" | "offline" | "unknown";

export interface Camera {
  id: string;
  videoDeviceId?: string | null;
  channel?: number | null;
  name?: string | null;
  rtspUrl?: string | null;
  streamUrl?: string | null;
  snapshotUrl?: string | null;
  postSiteId?: string | null;
  stationId?: string | null;
  enabled?: boolean;
  status?: CameraStatus;
  tenantId?: string;
  device?: Device | null;
  createdAt?: string;
  updatedAt?: string;
}

export type VideoEventType =
  | "motion"
  | "alarm"
  | "manual"
  | "offline"
  | "tamper";
export type VideoEventSeverity = "low" | "medium" | "high" | "critical";
export type VideoEventStatus = "new" | "ack" | "resolved";

export interface VideoEvent {
  id: string;
  videoCameraId?: string | null;
  videoDeviceId?: string | null;
  type?: VideoEventType;
  severity?: VideoEventSeverity;
  at: string;
  title?: string | null;
  description?: string | null;
  status?: VideoEventStatus;
  acknowledgedById?: string | null;
  incidentId?: string | null;
  videoClipId?: string | null;
  stationId?: string | null;
  postSiteId?: string | null;
  tenantId?: string;
  createdById?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ClipStatus = "pending" | "ready" | "failed";

export interface Clip {
  id: string;
  videoCameraId?: string | null;
  videoDeviceId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationSec?: number | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  label?: string | null;
  status?: ClipStatus;
  incidentId?: string | null;
  shareToken?: string | null;
  shareExpiresAt?: string | null;
  createdById?: string | null;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StreamInfo {
  type: "hls" | "webrtc" | "go2rtc" | "none";
  url: string | null;
  /** MediaMTX WHEP endpoint (same-origin) — sub-second WebRTC, tried before HLS. */
  webrtcUrl?: string;
  /** go2rtc WebSocket url (MSE/WebRTC signaling) — same-origin through the proxy. */
  ws?: string;
  /** go2rtc player engine transport priority, e.g. "webrtc,mse,hls". */
  mode?: string;
  src?: string;
  gateway?: string;
  snapshotUrl?: string;
}

export interface ShareResult {
  token: string;
  url: string;
  expiresAt: string;
}

const qstr = (params?: Record<string, string | undefined>): string => {
  if (!params) return "";
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();

  return s ? `?${s}` : "";
};

export const videoService = {
  // --- Devices ---
  devices(): Promise<Device[]> {
    // The endpoint returns { rows, count }, not a bare array — unwrap it (mirrors
    // relaySites). Without this the list was always empty, so saved devices "vanished".
    return ApiService.get(`/tenant/${tid()}/video/devices`).then(
      (r: Device[] | { rows?: Device[] }) =>
        Array.isArray(r) ? r : (r?.rows ?? []),
    );
  },
  device(id: string): Promise<Device> {
    return ApiService.get(`/tenant/${tid()}/video/device/${id}`);
  },
  createDevice(body: Partial<Device> & { password?: string }): Promise<Device> {
    return ApiService.post(`/tenant/${tid()}/video/device`, body);
  },
  updateDevice(
    id: string,
    body: Partial<Device> & { password?: string },
  ): Promise<Device> {
    return ApiService.put(`/tenant/${tid()}/video/device/${id}`, body);
  },
  deleteDevice(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/video/device/${id}`);
  },
  testDevice(id: string): Promise<{ status: string }> {
    return ApiService.post(`/tenant/${tid()}/video/device/${id}/test`);
  },
  syncCameras(id: string): Promise<Camera[]> {
    return ApiService.post(`/tenant/${tid()}/video/device/${id}/cameras`);
  },
  setGateway(
    id: string,
    body: { streamGatewayBase: string; streamFormat?: "hls" | "webrtc" },
  ): Promise<void> {
    return ApiService.put(`/tenant/${tid()}/video/device/${id}/gateway`, body);
  },
  gatewayConfig(id: string): Promise<{
    deviceName: string;
    cameraCount: number;
    gatewayBase: string | null;
    format: string;
    yaml: string;
  }> {
    return ApiService.get(`/tenant/${tid()}/video/device/${id}/gateway-config`);
  },

  // --- Relay sites (remote cameras) ---
  relaySites(): Promise<RelaySite[]> {
    return ApiService.get(`/tenant/${tid()}/video/relay-sites`).then(
      (r: RelaySite[] | { rows?: RelaySite[] }) =>
        Array.isArray(r) ? r : (r?.rows ?? []),
    );
  },
  createRelaySite(body: {
    name: string;
    ingestProtocol?: string;
    notes?: string;
  }): Promise<RelaySite> {
    return ApiService.post(`/tenant/${tid()}/video/relay-site`, body);
  },
  updateRelaySite(
    id: string,
    body: Partial<RelaySite> & { regenToken?: boolean },
  ): Promise<RelaySite> {
    return ApiService.put(`/tenant/${tid()}/video/relay-site/${id}`, body);
  },
  deleteRelaySite(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/video/relay-site/${id}`);
  },
  relayBundle(id: string): Promise<RelayBundle> {
    return ApiService.get(`/tenant/${tid()}/video/relay-site/${id}/bundle`);
  },

  // --- Cameras ---
  cameras(params?: {
    deviceId?: string;
    postSiteId?: string;
    stationId?: string;
  }): Promise<Camera[]> {
    return ApiService.get(`/tenant/${tid()}/video/cameras${qstr(params)}`);
  },
  camera(id: string): Promise<Camera> {
    return ApiService.get(`/tenant/${tid()}/video/camera/${id}`);
  },
  updateCamera(id: string, body: Partial<Camera>): Promise<Camera> {
    return ApiService.put(`/tenant/${tid()}/video/camera/${id}`, body);
  },
  stream(cameraId: string): Promise<StreamInfo> {
    return ApiService.get(`/tenant/${tid()}/video/camera/${cameraId}/stream`);
  },
  /** PTZ control via ONVIF. velocities -1..1; { stop: true } halts motion. */
  ptz(
    cameraId: string,
    body: { pan?: number; tilt?: number; zoom?: number; stop?: boolean },
  ): Promise<{ ok: boolean }> {
    return ApiService.post(
      `/tenant/${tid()}/video/camera/${cameraId}/ptz`,
      body,
    );
  },

  // --- Events ---
  events(params?: {
    status?: string;
    cameraId?: string;
  }): Promise<VideoEvent[]> {
    return ApiService.get(`/tenant/${tid()}/video/events${qstr(params)}`).then(
      (r: VideoEvent[] | { rows?: VideoEvent[] }) =>
        Array.isArray(r) ? r : (r?.rows ?? []),
    );
  },
  createEvent(body: Partial<VideoEvent>): Promise<VideoEvent> {
    return ApiService.post(`/tenant/${tid()}/video/event`, body);
  },
  updateEvent(id: string, body: Partial<VideoEvent>): Promise<VideoEvent> {
    return ApiService.patch(`/tenant/${tid()}/video/event/${id}`, body);
  },
  eventToIncident(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ id?: string; incidentId?: string }> {
    return ApiService.post(`/tenant/${tid()}/video/event/${id}/incident`, body);
  },

  // --- Clips ---
  clips(params?: { cameraId?: string }): Promise<Clip[]> {
    return ApiService.get(`/tenant/${tid()}/video/clips${qstr(params)}`).then(
      (r: Clip[] | { rows?: Clip[] }) =>
        Array.isArray(r) ? r : (r?.rows ?? []),
    );
  },
  createClip(body: {
    videoCameraId: string;
    startAt: string;
    endAt: string;
    label?: string;
  }): Promise<Clip> {
    return ApiService.post(`/tenant/${tid()}/video/clip`, body);
  },
  deleteClip(id: string): Promise<void> {
    return ApiService.delete(`/tenant/${tid()}/video/clip/${id}`);
  },
  shareClip(id: string): Promise<ShareResult> {
    return ApiService.post(`/tenant/${tid()}/video/clip/${id}/share`);
  },
  clipToIncident(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ id?: string; incidentId?: string }> {
    return ApiService.post(`/tenant/${tid()}/video/clip/${id}/incident`, body);
  },

  // --- Dispatch ---
  dispatch(body: {
    cameraId?: string;
    eventId?: string;
    note?: string;
  }): Promise<any> {
    return ApiService.post(`/tenant/${tid()}/video/dispatch`, body);
  },
};
