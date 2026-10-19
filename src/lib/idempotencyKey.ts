/**
 * A fresh key for the `Idempotency-Key` header (QA-97).
 *
 * The backend keeps the first answer of every write that carries this header
 * (see the backend\'s `lib/sinSenal.ts`): a second request with the same key
 * gets that answer back instead of creating the record again. One key per
 * form submission, so a double click or a retried request cannot duplicate
 * what was saved; a new key once it has been saved.
 */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      return crypto.randomUUID();
  } catch {
    /* fall through */
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
