/**
 * PAYSLIPS (`payroll_slips`) — what the office may do with the module right now.
 *
 *   full     → the company has the module: everything (setup, sheets, edits…).
 *   readOnly → it OWNS the module but switched it off in the store: only the
 *              sheets and slips already ISSUED (published), and their PDF/Excel.
 *              The backend serves exactly that through `requireModuloOrOwned`;
 *              every other payroll endpoint answers 402, so the screens must
 *              not call them.
 *   none     → never had it, or it was revoked: the module's presentation.
 *   loading  → not entitled and the store answer is still on its way.
 *   denied   → the company has it, but the person's role lacks the payslip
 *              permissions (the server answered 403): a no-access notice, not
 *              an endless skeleton or a «Prohibido» toast.
 *
 * Pure, so the gate decision is tested on its own (`access.test.ts`).
 */
export type PayrollAccess = "loading" | "full" | "readOnly" | "none" | "denied";

export interface PayrollAccessInput {
  /** The session's plan features include the module. */
  entitled: boolean;
  /** The module's entry in the store (`GET /tenant/:t/addons`), if known. */
  store: { owned?: boolean; paused?: boolean } | null | undefined;
  /** The store request is still pending. */
  storeLoading: boolean;
  /** A FULL-access endpoint answered 402 (a session older than a pause/revoke). */
  gatedRefused?: boolean;
  /**
   * A READ-ONLY endpoint (sheets, slips, their documents) answered 402: the
   * server says the company neither has nor owns the module.
   */
  readRefused?: boolean;
  /** A payslip endpoint answered 403: the role lacks the permission. */
  forbidden?: boolean;
}

export function payrollAccessMode(i: PayrollAccessInput): PayrollAccess {
  if (i.readRefused) return "none";
  if (i.forbidden) return "denied";
  if (i.entitled && !i.gatedRefused) return "full";
  if (i.store?.owned && i.store.paused) return "readOnly";
  if (i.storeLoading) return "loading";

  return "none";
}
