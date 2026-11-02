import type { FileDescriptor } from "../../guardDetailTypes";

import { fileUrlFromFile } from "@/lib/fileUrl";

/**
 * Where a stored license image opens. `privateUrl` is a storage path
 * («tenant/…/x.png»), not a link: opened as-is it resolved against the CRM
 * route and showed the CRM again. The server attaches `downloadUrl`.
 */
export function enlaceDeImagen(f?: FileDescriptor | null): string | null {
  if (!f) return null;

  return f.downloadUrl || f.publicUrl || fileUrlFromFile(f);
}

/**
 * The license form marks type and number as required: a license with neither
 * is an empty record («Licencia · Sin número»).
 */
export function licenciaIncompleta(f: {
  licenseType: string;
  customLicenseName: string;
  licenseNumber: string;
}): "tipo" | "numero" | null {
  const conTipo =
    (!!f.licenseType && f.licenseType !== "other") ||
    !!f.customLicenseName.trim();

  if (!conTipo) return "tipo";
  if (!f.licenseNumber.trim()) return "numero";

  return null;
}
