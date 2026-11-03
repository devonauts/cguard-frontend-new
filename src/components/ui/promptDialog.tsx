import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MessageSquareText } from "lucide-react";

import { createAskStore, type Pending } from "./askStore";

/**
 * Reemplazo imperativo y con el vidrio del CRM de window.prompt().
 *
 *   const v = await promptDialog({ title: "Motivo", placeholder: "…" });
 *   if (v == null) return;   // canceló
 *
 * Un solo <PromptHost/> (montado en main, junto a ConfirmHost) pinta el modal.
 * Devuelve el texto, o null si se cancela.
 *
 * A Radix dialog, so it stacks on an open Sheet or Dialog (the reason asked
 * from a request's detail panel): its field takes the focus and the typing,
 * its buttons take the click, Esc closes only it. Enter in the field accepts;
 * Enter on «Cancelar» cancels (a window-level Enter used to accept).
 */
export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

const store = createAskStore<PromptOptions, string | null>(null);

export function promptDialog(
  opts: PromptOptions | string,
): Promise<string | null> {
  const o: PromptOptions = typeof opts === "string" ? { title: opts } : opts;

  return store.ask(o);
}

export function PromptHost() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Pending<PromptOptions, string | null> | null>(null);
  const [val, setVal] = useState("");

  useEffect(
    () =>
      store.subscribe((p) => {
        setOpen(p);
        setVal(p?.options.defaultValue || "");
      }),
    [],
  );

  if (!open) return null;
  const state = open.options;
  const close = (v: string | null) => store.answer(open.id, v);

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) close(null);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-foreground/30 backdrop-blur-[3px] animate-in fade-in duration-150 motion-reduce:animate-none!" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="glass-raised fixed left-1/2 top-1/2 z-[200] max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 animate-in zoom-in-95 duration-150 motion-reduce:animate-none!"
          style={{ position: "fixed" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              close(val);
            }}
          >
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand-wash)] text-[color:var(--brand-text)]">
                <MessageSquareText size={20} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogPrimitive.Title asChild>
                  <h3 className="text-base font-semibold tracking-[-0.01em] text-[color:var(--ink)]">
                    {state.title ||
                      t("kit.dialog.promptTitle", {
                        defaultValue: "Escribe un valor",
                      })}
                  </h3>
                </DialogPrimitive.Title>
                {state.message && (
                  <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--ink-soft)]">
                    {state.message}
                  </p>
                )}
              </div>
            </div>
            {/* The first field: Radix gives it the focus when the dialog opens. */}
            <input
              className="cg-input mt-4 w-full rounded-[var(--r-md)] px-3 py-2 text-sm"
              placeholder={state.placeholder}
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="cg-btn-glass cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none"
                type="button"
                onClick={() => close(null)}
              >
                {state.cancelText ||
                  t("kit.dialog.cancel", { defaultValue: "Cancelar" })}
              </button>
              <button
                className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none"
                type="submit"
              >
                {state.confirmText ||
                  t("kit.dialog.accept", { defaultValue: "Aceptar" })}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
