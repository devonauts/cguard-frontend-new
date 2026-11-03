import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, HelpCircle } from "lucide-react";

import { createAskStore, type Pending } from "./askStore";

/**
 * Imperative, platform-styled replacement for window.confirm().
 *
 *   if (!(await confirmDialog('¿Eliminar?'))) return;
 *   if (!(await confirmDialog({ title: 'Quitar vigilante', message: '…', tone: 'danger' }))) return;
 *
 * A single <ConfirmHost/> (mounted once in App) renders the modal. No provider/hook
 * needed at the call site — just await the function.
 *
 * It is a Radix dialog, so it stacks on top of an open Sheet or Dialog like
 * any nested layer: its buttons take the click (the hand-made overlay inherited
 * the Sheet's `pointer-events: none`, so «Cancelar» hit the Sheet's backdrop),
 * focus stays in it, and Esc closes only it. Enter presses the focused button
 * (the confirm button has the focus when it opens); before, a window-level
 * Enter confirmed even with the focus on «Cancelar».
 */
type Tone = "default" | "danger";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}

const store = createAskStore<ConfirmOptions, boolean>(false);

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const options: ConfirmOptions =
    typeof opts === "string" ? { message: opts } : opts;

  return store.ask({ tone: "default", ...options });
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Pending<ConfirmOptions, boolean> | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => store.subscribe(setOpen), []);

  if (!open) return null;
  const state = open.options;
  const danger = state.tone === "danger";
  const close = (val: boolean) => store.answer(open.id, val);

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <DialogPrimitive.Portal>
        {/* Mismo velo que <Dialog>: tinta del lienzo al 30% + desenfoque, para que el
            confirm imperativo y el diálogo declarativo no se vean como dos sistemas. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-foreground/30 backdrop-blur-[3px] animate-in fade-in duration-150 motion-reduce:animate-none!" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="glass-raised fixed left-1/2 top-1/2 z-[200] max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 animate-in zoom-in-95 duration-150 motion-reduce:animate-none!"
          role="alertdialog"
          style={{ position: "fixed" }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            confirmRef.current?.focus();
          }}
        >
          <div className="flex gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] ${
                danger
                  ? "bg-[color-mix(in_oklab,var(--bad)_16%,transparent)] text-[color:var(--bad-text)]"
                  : "bg-[var(--brand-wash)] text-[color:var(--brand-text)]"
              }`}
            >
              {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogPrimitive.Title asChild>
                <h3 className="text-base font-semibold tracking-[-0.01em] text-[color:var(--ink)]">
                  {state.title ||
                    (danger
                      ? t("kit.dialog.confirmTitle", {
                          defaultValue: "Confirmar acción",
                        })
                      : t("kit.dialog.sureTitle", {
                          defaultValue: "¿Estás seguro?",
                        }))}
                </h3>
              </DialogPrimitive.Title>
              <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--ink-soft)]">
                {state.message}
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="cg-btn-glass cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none"
              type="button"
              onClick={() => close(false)}
            >
              {state.cancelText ||
                t("kit.dialog.cancel", { defaultValue: "Cancelar" })}
            </button>
            <button
              ref={confirmRef}
              className={`cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none ${
                danger ? "cg-btn-bad" : "cg-btn-brand"
              }`}
              type="button"
              onClick={() => close(true)}
            >
              {state.confirmText ||
                t("kit.dialog.confirm", { defaultValue: "Confirmar" })}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
