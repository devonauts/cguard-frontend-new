import type { CommentAttachment } from "./types";

import api from "@/lib/api";
import i18n from "@/i18n";

/**
 * Storage for a file attached to an incident comment. The pages asked for
 * credentials with `storageId=localhost`, which is not a storage at all, so
 * the server answered 403 every time and the comment went out without it.
 */
export const COMMENT_FILE_STORAGE = "incidentImageUrl";

/** A readable reason out of whatever the upload threw (Error, api error, text). */
export function uploadErrorText(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const e = err as { message?: unknown; data?: { message?: unknown } };

  if (
    typeof e.message === "string" &&
    e.message &&
    !e.message.includes("[object Object]")
  )
    return e.message;
  if (e.data && typeof e.data.message === "string") return e.data.message;

  return "";
}

/**
 * Uploads the file and returns what the comment stores: a link and a name.
 * The link is the signed `downloadUrl` the credentials come with; the API
 * re-signs it every time the comments are served (lib/fileTokenRefresh).
 */
export async function uploadCommentAttachment(
  tenantId: string,
  file: File,
): Promise<CommentAttachment> {
  const credsResp: any = await api.get(
    `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(file.name)}&storageId=${COMMENT_FILE_STORAGE}`,
  );
  const creds = credsResp && credsResp.data ? credsResp.data : credsResp;
  const uploadUrl: string | undefined =
    creds?.uploadCredentials?.url ?? creds?.url;
  const fields: Record<string, string> | undefined =
    creds?.uploadCredentials?.fields ?? creds?.fields;

  if (!uploadUrl)
    throw new Error(
      i18n.t("ui.apiService.urlDeCargaNoDisponible", "URL de carga no disponible"),
    );

  let resp: Response;

  if (fields || uploadUrl.includes("/file/upload?token=")) {
    const form = new FormData();

    if (fields) {
      Object.keys(fields).forEach((k) => form.append(k, fields[k]));
      form.append("file", file, file.name);
    } else {
      form.append("filename", file.name);
      form.append("file", file);
    }
    resp = await fetch(uploadUrl, { method: "POST", body: form });
  } else {
    resp = await fetch(uploadUrl, { method: "PUT", body: file });
  }
  if (!resp.ok) {
    throw new Error(
      i18n.t("ui.apiService.errorAlSubirArchivoSinCodigo", "Error al subir el archivo"),
    );
  }

  const url: string | undefined =
    creds?.downloadUrl || creds?.uploadCredentials?.publicUrl || creds?.publicUrl;

  if (!url) throw new Error("");

  return { url, name: file.name };
}
