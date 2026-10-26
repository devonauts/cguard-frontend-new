import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  destinoSeguro,
  guardarDestino,
  puedoTraspasar,
  tomarDestino,
} from "./traspaso";

import { abrirSesionDeCodigo } from "@/lib/sesionDeCodigo";

/**
 * Cualquier ruta que la mini-app pública NO tiene (todo el CRM).
 *   · Sin sesión → al acceso, recordando adónde iba.
 *   · Con sesión → traspaso: cookie del código y recarga en el destino.
 */
export function CualquierOtraRuta() {
  const loc = useLocation();
  const ruta = loc.pathname + loc.search + loc.hash;
  let token: string | null = null;

  try {
    token = localStorage.getItem("authToken");
  } catch {
    token = null;
  }

  if (!token) {
    guardarDestino(ruta, sessionStorage);

    return (
      <Navigate
        replace
        state={{ from: { pathname: ruta } }}
        to={`/login?next=${encodeURIComponent(ruta)}`}
      />
    );
  }

  return (
    <Traspaso
      destino={
        tomarDestino(sessionStorage) ?? destinoSeguro(ruta) ?? "/dashboard"
      }
    />
  );
}

function Traspaso({ destino }: { destino: string }) {
  const { t } = useTranslation();
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      if (!puedoTraspasar(sessionStorage)) {
        setFallo(true);

        return;
      }
      const r = await abrirSesionDeCodigo();

      if (!vivo) return;
      if (r === "ok") {
        window.location.replace(destino);

        return;
      }
      if (r === "rechazada") {
        // El token ya no vale: fuera, y una carga limpia del acceso.
        try {
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUserCache");
        } catch {
          /* ignore */
        }
        window.location.replace("/login");

        return;
      }
      setFallo(true);
    })();

    return () => {
      vivo = false;
    };
  }, [destino]);

  const volverAEntrar = () => {
    try {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUserCache");
      sessionStorage.removeItem("cg.traspasos");
    } catch {
      /* ignore */
    }
    window.location.replace("/login");
  };

  const reintentar = () => {
    try {
      sessionStorage.removeItem("cg.traspasos");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-[#F8F7F4] px-6 text-center dark:bg-[#0A0A0A]">
      {fallo ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("publico.traspaso.error")}
          </p>
          <div className="flex gap-3">
            <button
              className="rounded-md border px-4 py-2 text-sm"
              type="button"
              onClick={reintentar}
            >
              {t("publico.traspaso.reintentar")}
            </button>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              type="button"
              onClick={volverAEntrar}
            >
              {t("publico.traspaso.volverAEntrar")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">
            {t("publico.traspaso.abriendo")}
          </p>
        </>
      )}
    </div>
  );
}
