import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * MERCADO PAGO 3-D SECURE, WITH THE OWNER IN FRONT OF THE SCREEN.
 *
 * The server creates the payment with `three_d_secure_mode: 'optional'` only
 * when the company is paying on screen («Pay» or saving the card). When the
 * issuer asks for a challenge, Mercado Pago answers `pending_challenge` with
 * `three_ds_info { external_resource_url, creq }`, and the bank's page is shown
 * here: an iframe that receives a POST of `creq` to that URL.
 *
 * When the holder finishes, the bank's page posts `{ status: "COMPLETE" }` to
 * this window; then `onDone` re-reads the payment on the server
 * (`pay/confirm`). If that message never arrives (some issuers do not send it)
 * the «I already confirmed» button does the same: the server re-reads the
 * payment anyway, so pressing it early can only answer «still pending».
 *
 * ORDERS (Orders API, used for modules and «Pay now» since 2026-11-01) hand
 * just the bank's URL, with no `creq`: the iframe opens it directly.
 *
 * Unattended charges (the sweep) never ask for 3-D Secure.
 */
export default function Desafio3dsMercadoPago({
  url,
  creq,
  onDone,
  onCancel,
}: {
  url: string;
  creq: string;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const nombre = `mp-3ds-${id}`;
  const formulario = useRef<HTMLFormElement>(null);
  const [cargado, setCargado] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const hecho = useRef(false);

  const terminar = async () => {
    if (hecho.current) return;
    hecho.current = true;
    setTerminando(true);
    try {
      await onDone();
    } finally {
      setTerminando(false);
    }
  };

  // Post the challenge request into the iframe once it exists (payments; an order's URL opens by itself).
  useEffect(() => {
    if (creq) formulario.current?.submit();
  }, [url, creq]);

  // The issuer's page tells us when the holder is done.
  useEffect(() => {
    let origen = "";

    try {
      origen = new URL(url).origin;
    } catch {
      origen = "";
    }
    const alMensaje = (e: MessageEvent) => {
      const d: any = e.data;
      const estado = typeof d === "string" ? safeParse(d)?.status : d?.status;

      if (estado !== "COMPLETE") return;
      // Mercado Pago's own pages or the issuer's ACS (the challenge's origin).
      const valido =
        e.origin === origen || /(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(hostDe(e.origin));

      if (valido) void terminar();
    };

    window.addEventListener("message", alMensaje);

    return () => window.removeEventListener("message", alMensaje);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("billing.partner.mp3ds.intro", {
          defaultValue:
            "Tu banco pide confirmar este pago. Sigue los pasos en el recuadro.",
        })}
      </p>
      <div className="relative w-full overflow-hidden rounded-md border bg-white" style={{ height: 420 }}>
        {!cargado && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin opacity-60" />
          </div>
        )}
        <iframe
          className="h-full w-full"
          name={nombre}
          src={creq ? undefined : url}
          title={t("billing.partner.mp3ds.frameTitle", {
            defaultValue: "Confirmación de tu banco",
          })}
          onLoad={() => setCargado(true)}
        />
      </div>
      {creq && (
        <form
          ref={formulario}
          action={url}
          className="hidden"
          method="POST"
          target={nombre}
        >
          <input name="creq" type="hidden" value={creq} />
        </form>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={terminando} type="button" variant="outline" onClick={onCancel}>
          {t("billing.partner.mp3ds.cancel", { defaultValue: "Cancelar" })}
        </Button>
        <Button disabled={terminando} type="button" onClick={() => void terminar()}>
          {terminando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("billing.partner.mp3ds.done", {
            defaultValue: "Ya confirmé con mi banco",
          })}
        </Button>
      </div>
    </div>
  );
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function hostDe(origen: string): string {
  try {
    return new URL(origen).hostname;
  } catch {
    return "";
  }
}
