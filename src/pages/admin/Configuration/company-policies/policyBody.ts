import type { PolicyForm } from "./PolicyDialog";

/** The API keeps `departmentIds` as a JSON array; older rows may hold it as text. */
export function firstDepartmentId(
  v: string[] | string | null | undefined,
): string | undefined {
  let ids: unknown = v;

  if (typeof v === "string") {
    try {
      ids = JSON.parse(v);
    } catch {
      ids = [];
    }
  }

  return Array.isArray(ids) && ids.length ? String(ids[0]) : undefined;
}

/** What the server reads: `departmentIds` (empty = the whole company). */
export function policyBody(data: PolicyForm, status: "published" | "draft") {
  return {
    title: data.title.trim(),
    content: data.content,
    departmentIds: data.departmentId ? [data.departmentId] : [],
    status,
  };
}
