/** A readable reason out of whatever the upload threw (Error, api error, text). */
export function uploadErrorText(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  // A network failure is a TypeError carrying the browser's own English text
  // («Failed to fetch»): our sentence already says the upload failed.
  if (err instanceof TypeError) return "";
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
