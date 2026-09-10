import { toast } from "sonner";

const recent = new Map<string, number>();
const WINDOW_MS = 2000;

function keyOf(type: string, message?: string) {
  return `${type}::${message ?? ""}`;
}

export const toastOnce = {
  success(msg?: string) {
    const k = keyOf("success", msg);
    const now = Date.now();
    const last = recent.get(k) ?? 0;

    if (now - last < WINDOW_MS) return;
    recent.set(k, now);
    toast.success(msg);
  },
  error(msg?: string) {
    const k = keyOf("error", msg);
    const now = Date.now();
    const last = recent.get(k) ?? 0;

    if (now - last < WINDOW_MS) return;
    recent.set(k, now);
    toast.error(msg);
  },
  // fallback to generic toast for other types
  notice(msg?: string) {
    const k = keyOf("notice", msg);
    const now = Date.now();
    const last = recent.get(k) ?? 0;

    if (now - last < WINDOW_MS) return;
    recent.set(k, now);
    toast(msg);
  },
};

export default toastOnce;
