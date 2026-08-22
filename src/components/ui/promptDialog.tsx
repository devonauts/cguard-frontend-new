import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquareText } from "lucide-react";

/**
 * Reemplazo imperativo y con el vidrio del CRM de window.prompt().
 *
 *   const v = await promptDialog({ title: "Motivo", placeholder: "…" });
 *   if (v == null) return;   // canceló
 *
 * Un solo <PromptHost/> (montado en main, junto a ConfirmHost) pinta el modal.
 * Devuelve el texto, o null si se cancela.
 */
export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

interface State extends PromptOptions { id: number; resolve: (v: string | null) => void }

let listeners: Array<(s: State | null) => void> = [];
let current: State | null = null;
let seq = 0;
const emit = () => listeners.forEach((l) => l(current));

export function promptDialog(opts: PromptOptions | string): Promise<string | null> {
  const o: PromptOptions = typeof opts === "string" ? { title: opts } : opts;
  return new Promise((resolve) => { current = { id: ++seq, ...o, resolve }; emit(); });
}

export function PromptHost() {
  const { t } = useTranslation();
  const [state, setState] = useState<State | null>(null);
  const [val, setVal] = useState("");

  useEffect(() => {
    const l = (s: State | null) => { setState(s); setVal(s?.defaultValue || ""); };
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);

  const close = (v: string | null) => { if (current) current.resolve(v); current = null; emit(); };

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
      else if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") close(val);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, val]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-[3px] animate-in fade-in duration-150 motion-reduce:animate-none!"
      onClick={() => close(null)}
    >
      <div
        role="dialog" aria-modal="true"
        className="glass-raised w-full max-w-sm p-5 animate-in zoom-in-95 duration-150 motion-reduce:animate-none!"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand-wash)] text-[color:var(--brand-text)]">
            <MessageSquareText size={20} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-[color:var(--ink)]">{state.title || t('kit.dialog.promptTitle', { defaultValue: 'Escribe un valor' })}</h3>
            {state.message && <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--ink-soft)]">{state.message}</p>}
          </div>
        </div>
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={state.placeholder}
          className="cg-input mt-4 w-full rounded-[var(--r-md)] px-3 py-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => close(null)}
            className="cg-btn-glass cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none"
          >
            {state.cancelText || t('kit.dialog.cancel', { defaultValue: 'Cancelar' })}
          </button>
          <button
            onClick={() => close(val)}
            className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none"
          >
            {state.confirmText || t('kit.dialog.accept', { defaultValue: 'Aceptar' })}
          </button>
        </div>
      </div>
    </div>
  );
}
