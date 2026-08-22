import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, HelpCircle } from 'lucide-react';

/**
 * Imperative, platform-styled replacement for window.confirm().
 *
 *   if (!(await confirmDialog('¿Eliminar?'))) return;
 *   if (!(await confirmDialog({ title: 'Quitar vigilante', message: '…', tone: 'danger' }))) return;
 *
 * A single <ConfirmHost/> (mounted once in App) renders the modal. No provider/hook
 * needed at the call site — just await the function.
 */
type Tone = 'default' | 'danger';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}

interface DialogState extends ConfirmOptions {
  id: number;
  resolve: (v: boolean) => void;
}

let listeners: Array<(s: DialogState | null) => void> = [];
let current: DialogState | null = null;
let seq = 0;
const emit = () => listeners.forEach((l) => l(current));

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const options: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
  return new Promise<boolean>((resolve) => {
    current = { id: ++seq, tone: 'default', ...options, resolve };
    emit();
  });
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const [state, setState] = useState<DialogState | null>(null);

  useEffect(() => {
    const l = (s: DialogState | null) => setState(s);
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);

  const close = (val: boolean) => {
    if (current) current.resolve(val);
    current = null;
    emit();
  };

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  if (!state) return null;
  const danger = state.tone === 'danger';

  return (
    // Mismo velo que <Dialog>: tinta del lienzo al 30% + desenfoque, para que el
    // confirm imperativo y el diálogo declarativo no se vean como dos sistemas.
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-[3px] animate-in fade-in duration-150 motion-reduce:animate-none!"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="glass-raised w-full max-w-sm p-5 animate-in zoom-in-95 duration-150 motion-reduce:animate-none!"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] ${
              danger
                ? 'bg-[color-mix(in_oklab,var(--bad)_16%,transparent)] text-[color:var(--bad-text)]'
                : 'bg-[var(--brand-wash)] text-[color:var(--brand-text)]'
            }`}
          >
            {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-[color:var(--ink)]">
              {state.title || (danger
                ? t('kit.dialog.confirmTitle', { defaultValue: 'Confirmar acción' })
                : t('kit.dialog.sureTitle', { defaultValue: '¿Estás seguro?' }))}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--ink-soft)]">
              {state.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => close(false)}
            className="cg-btn-glass cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none"
          >
            {state.cancelText || t('kit.dialog.cancel', { defaultValue: 'Cancelar' })}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className={`cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none ${
              danger ? 'cg-btn-bad' : 'cg-btn-brand'
            }`}
          >
            {state.confirmText || t('kit.dialog.confirm', { defaultValue: 'Confirmar' })}
          </button>
        </div>
      </div>
    </div>
  );
}
