import i18n from "@/i18n";
import api from "../api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      i18n.t(
        "ui.apiService.noPudimosIdentificarTuEmpresa",
        "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
      ),
    );

  return t;
};

export type MessageAttachment = {
  url: string;
  type: "image" | "video" | "audio";
  name?: string;
  sizeInBytes?: number;
};
export type GroupMember = {
  id: string;
  userId: string;
  name: string;
  participantType: "staff" | "guard" | "client";
  role: "admin" | "member";
  source: "auto" | "manual";
};

/** Alguien a quien el CRM puede escribir (GET /message-people). */
export type MessagePerson = {
  kind: "guard" | "staff" | "client";
  /** Su usuario: lo que usan los grupos. null = sin cuenta en la app. */
  userId: string | null;
  recipientType: "guard" | "staff" | "client";
  recipientId: string;
  name: string;
  roles: string[];
  detail: string | null;
  hasAccount: boolean;
};

const unwrap = (resp: any) =>
  resp && resp.data !== undefined ? resp.data : resp;
const newClientMsgId = () =>
  globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const messageService = {
  async listConversations(
    params: {
      limit?: number;
      cursor?: string;
      recipientType?: string;
      q?: string;
    } = {},
  ) {
    const t = getTenantId();
    const qs = new URLSearchParams(
      Object.entries(params).reduce(
        (a, [k, v]) => {
          if (v != null && v !== "") a[k] = String(v);

          return a;
        },
        {} as Record<string, string>,
      ),
    ).toString();

    return unwrap(await api.get(`/tenant/${t}/message${qs ? `?${qs}` : ""}`));
  },

  /** Vigilantes, equipo y clientes en una sola búsqueda. */
  async searchPeople(
    q: string,
    kind?: MessagePerson["kind"],
  ): Promise<MessagePerson[]> {
    const t = getTenantId();
    const qs = new URLSearchParams({ q, ...(kind ? { kind } : {}) }).toString();
    const res = unwrap(await api.get(`/tenant/${t}/message-people?${qs}`));

    return Array.isArray(res?.rows) ? res.rows : [];
  },

  async createConversation(input: {
    recipientType: "guard" | "client" | "staff";
    recipientId: string;
    subject?: string;
    isOneWay?: boolean;
    body: string;
  }) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/message`, {
        data: { ...input, clientMsgId: newClientMsgId() },
      }),
    );
  },

  async getConversation(id: string) {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/message/${id}`));
  },

  async listMessages(
    id: string,
    params: { limit?: number; before?: string } = {},
  ) {
    const t = getTenantId();
    const qs = new URLSearchParams(
      Object.entries(params).reduce(
        (a, [k, v]) => {
          if (v != null && v !== "") a[k] = String(v);

          return a;
        },
        {} as Record<string, string>,
      ),
    ).toString();

    return unwrap(
      await api.get(`/tenant/${t}/message/${id}/messages${qs ? `?${qs}` : ""}`),
    );
  },

  async sendMessage(
    id: string,
    body: string,
    attachments?: MessageAttachment[],
  ) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/message/${id}/messages`, {
        data: {
          body,
          attachments:
            attachments && attachments.length ? attachments : undefined,
          clientMsgId: newClientMsgId(),
        },
      }),
    );
  },

  /** Upload an image/video and return its attachment descriptor (private url). */
  async uploadAttachment(file: File): Promise<MessageAttachment> {
    const t = getTenantId();
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const credsResp: any = await api.get(
      `/tenant/${t}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=messageAttachments`,
    );
    const creds = credsResp && credsResp.data ? credsResp.data : credsResp;
    const uploadUrl = creds?.uploadCredentials?.url ?? creds?.url;
    const fields = creds?.uploadCredentials?.fields;

    if (!uploadUrl) throw new Error(i18n.t("ui.apiService.noSePudoObtenerLaUrlDeCarga", "No se pudo obtener la URL de carga"));
    const form = new FormData();

    if (fields) Object.keys(fields).forEach((k) => form.append(k, fields[k]));
    form.append("filename", filename);
    form.append("file", file);
    const resp = await fetch(uploadUrl, { method: "POST", body: form });

    if (!resp.ok) throw new Error(i18n.t("ui.apiService.errorAlSubirElArchivo", { defaultValue: "Error al subir el archivo ({{status}})", status: resp.status }));

    return {
      url: creds?.privateUrl ?? "",
      type: file.type.startsWith("video")
        ? "video"
        : file.type.startsWith("audio")
          ? "audio"
          : "image",
      name: file.name,
      sizeInBytes: file.size,
    };
  },

  async markRead(id: string) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/message/${id}/read`, { data: {} }),
    );
  },

  async patchConversation(
    id: string,
    patch: { isOneWay?: boolean; archived?: boolean; name?: string },
  ) {
    const t = getTenantId();

    return unwrap(
      await api.patch(`/tenant/${t}/message/${id}`, { data: patch }),
    );
  },

  // ── Group chats ──────────────────────────────────────────────────────────
  /** Create a group anchored to a post site / station; members are derived from
   *  its guard assignments (plus any extraMemberUserIds). */
  async createGroup(input: {
    name: string;
    anchorType?: "postSite" | "station";
    anchorId?: string;
    isOneWay?: boolean;
    extraMemberUserIds?: string[];
    body?: string;
    attachments?: MessageAttachment[];
  }) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/message/groups`, {
        data: { ...input, clientMsgId: newClientMsgId() },
      }),
    );
  },

  async listMembers(id: string): Promise<{ rows: GroupMember[] }> {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/message/groups/${id}/members`));
  },

  async addMembers(id: string, userIds: string[]) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/message/groups/${id}/members`, {
        data: { userIds },
      }),
    );
  },

  async removeMember(id: string, userId: string) {
    const t = getTenantId();

    return unwrap(
      await api.delete(`/tenant/${t}/message/groups/${id}/members/${userId}`),
    );
  },

  async resyncMembers(id: string) {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/message/groups/${id}/resync`, { data: {} }),
    );
  },

  async deleteConversation(id: string) {
    const t = getTenantId();

    return unwrap(await api.delete(`/tenant/${t}/message/${id}`));
  },

  async unreadCount() {
    const t = getTenantId();

    return unwrap(await api.get(`/tenant/${t}/message-unread`));
  },
};

export default messageService;
