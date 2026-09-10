/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA PÁGINA DEL ENLACE PRIVADO — `/d/:token`
 *
 * Lo que ve quien recibe la documentación por correo. Sin cuenta y sin app: el
 * caso concreto es el contador del cliente, que es quien tramita el pago y casi
 * nunca tiene instalada Mi Seguridad.
 *
 * ── POR QUÉ LA CLAVE SE GUARDA EN MEMORIA Y NO EN EL NAVEGADOR ─────────────
 * Al desbloquear, la clave se queda en un `useState` y se reenvía en cada
 * descarga. NO va a `localStorage` ni a una cookie: el enlace ya es una llave,
 * y dejar la segunda escrita en el disco del que lo abre convierte «dos
 * factores» en uno. Recargar la página vuelve a pedirla, y eso es correcto.
 *
 * ── MÓVIL PRIMERO ─────────────────────────────────────────────────────────
 * Esto se abre desde el correo, y el correo se lee en el teléfono. Una sola
 * columna, botones de 44 px, y el teclado numérico para la clave.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import BrandLockup from "@/components/BrandLockup";
import { Button } from "@/components/ui/button";

const API = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

interface Doc {
  itemId: string;
  name: string;
  sizeInBytes: number;
  downloadCount: number;
  downloadPath: string;
}
interface Payload {
  state?: "active" | "expired" | "revoked" | "locked";
  unlocked?: boolean;
  requiresCode?: boolean;
  name?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  notes?: string | null;
  status?: string;
  documentCount?: number;
  documents?: Doc[];
  expiresAt?: string;
  createdByName?: string;
  decidedByName?: string | null;
  decisionAt?: string | null;
}

const bytes = (b: number) => {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));

  return `${Math.round((b / 1024 ** i) * 10) / 10} ${u[i]}`;
};

const MOTIVO: Record<string, { titulo: string; texto: string }> = {
  expired: {
    titulo: "Este enlace ha caducado",
    texto:
      "Los enlaces de documentación caducan por seguridad. Pide uno nuevo a tu proveedor de seguridad.",
  },
  revoked: {
    titulo: "Este enlace ya no está disponible",
    texto:
      "Se ha retirado el acceso a esta documentación. Ponte en contacto con tu proveedor de seguridad.",
  },
  locked: {
    titulo: "Enlace bloqueado",
    texto:
      "Se han agotado los intentos de clave. Por seguridad, hay que emitir un enlace nuevo.",
  },
};

export default function DocumentPacketPublicView() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Payload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noExiste, setNoExiste] = useState(false);

  const [clave, setClave] = useState("");
  const [claveActiva, setClaveActiva] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);

  const [decidiendo, setDecidiendo] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [nombre, setNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviandoDecision, setEnviandoDecision] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/public/doc-packet/${encodeURIComponent(token)}`,
      );

      if (!r.ok) {
        setNoExiste(true);

        return;
      }
      setData(await r.json());
    } catch {
      setNoExiste(true);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const desbloquear = async () => {
    setVerificando(true);
    setErrorClave(null);
    try {
      const r = await fetch(
        `${API}/public/doc-packet/${encodeURIComponent(token)}/unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: clave }),
        },
      );
      const j = await r.json();

      if (!r.ok) {
        setErrorClave(
          j?.locked
            ? "Se han agotado los intentos. El enlace queda bloqueado."
            : `Clave incorrecta. Te quedan ${j?.attemptsLeft ?? 0} intento(s).`,
        );
        if (j?.locked) await cargar();

        return;
      }
      setClaveActiva(clave);
      setData(j);
    } catch {
      setErrorClave("No se pudo comprobar la clave. Inténtalo de nuevo.");
    } finally {
      setVerificando(false);
    }
  };

  /** La descarga es una navegación normal: el servidor anota y redirige. */
  const descargar = (d: Doc) => {
    const qs = claveActiva ? `?code=${encodeURIComponent(claveActiva)}` : "";

    window.location.href = `${API}${d.downloadPath}${qs}`;
  };

  const decidir = async () => {
    if (!decidiendo) return;
    setEnviandoDecision(true);
    try {
      const r = await fetch(
        `${API}/public/doc-packet/${encodeURIComponent(token)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: decidiendo,
            comment: comentario,
            name: nombre,
            code: claveActiva || undefined,
          }),
        },
      );

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));

        setErrorClave(j?.message || "No se pudo registrar la decisión.");

        return;
      }
      setDecidiendo(null);
      await cargar();
      // Tras decidir hay que volver a poner la clave: la recarga vuelve a la
      // portada. Se conserva la que ya se usó para no obligar a teclearla otra vez.
      if (claveActiva) {
        const r2 = await fetch(
          `${API}/public/doc-packet/${encodeURIComponent(token)}/unlock`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: claveActiva }),
          },
        );

        if (r2.ok) setData(await r2.json());
      }
    } catch {
      setErrorClave("No se pudo registrar la decisión.");
    } finally {
      setEnviandoDecision(false);
    }
  };

  const Marco = ({ children }: { children: React.ReactNode }) => (
    <div
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--app-bg, #0d1117)" }}
    >
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex justify-center">
          <BrandLockup />
        </div>
        {children}
      </div>
    </div>
  );

  const Tarjeta = ({ children }: { children: React.ReactNode }) => (
    <div className="glass rounded-3xl p-5 sm:p-6">{children}</div>
  );

  if (cargando) {
    return (
      <Marco>
        <Tarjeta>
          <div
            className="flex items-center justify-center gap-2 py-10"
            style={{ color: "var(--ink-soft)" }}
          >
            <Loader2 className="h-5 w-5 animate-spin" /> Abriendo documentación…
          </div>
        </Tarjeta>
      </Marco>
    );
  }

  if (noExiste || !data) {
    return (
      <Marco>
        <Tarjeta>
          <div className="py-8 text-center">
            <ShieldAlert
              className="mx-auto mb-3 h-10 w-10"
              style={{ color: "var(--ink-faint)" }}
            />
            <h1 className="text-lg font-semibold">Enlace no válido</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              Este enlace no existe o ha dejado de estar disponible. Pide uno
              nuevo a tu proveedor de seguridad.
            </p>
          </div>
        </Tarjeta>
      </Marco>
    );
  }

  const motivo =
    data.state && data.state !== "active" ? MOTIVO[data.state] : null;

  if (motivo) {
    return (
      <Marco>
        <Tarjeta>
          <div className="py-8 text-center">
            <Clock
              className="mx-auto mb-3 h-10 w-10"
              style={{ color: "var(--ink-faint)" }}
            />
            <h1 className="text-lg font-semibold">{motivo.titulo}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {motivo.texto}
            </p>
            {data.name && (
              <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                {data.name}
              </p>
            )}
          </div>
        </Tarjeta>
      </Marco>
    );
  }

  const periodo = [data.periodStart, data.periodEnd]
    .filter(Boolean)
    .map((d) => String(d).slice(0, 10))
    .join(" → ");

  /* ── Pantalla de clave ── */
  if (!data.unlocked) {
    return (
      <Marco>
        <Tarjeta>
          <div className="text-center">
            <Lock
              className="mx-auto mb-3 h-9 w-9"
              style={{ color: "var(--brand)" }}
            />
            <h1 className="text-lg font-semibold">{data.name}</h1>
            {periodo && (
              <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                {periodo}
              </p>
            )}
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {data.documentCount} documento(s)
            </p>
            <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
              Introduce la clave de acceso que te facilitó tu proveedor de
              seguridad.
            </p>

            <input
              aria-label="Clave de acceso"
              onChange={(e) => setClave(e.target.value.replace(/\D/g, '').slice(0, 6))}
              // `inputMode` numérico: en el teléfono sale el teclado de números,
              // no el alfabético con los dígitos escondidos tras una tecla.
              autoComplete="one-time-code"
              className="cg-input mx-auto mt-4 block w-48 py-3 text-center text-2xl tabular-nums tracking-[0.4em]"
              inputMode="numeric"
              placeholder="000000"
              value={clave}
              onKeyDown={(e) => { if (e.key === 'Enter' && clave.length === 6) void desbloquear(); }}
            />
            {errorClave && (
              <p className="mt-2 text-sm" style={{ color: "var(--bad-text)" }}>
                {errorClave}
              </p>
            )}
            <Button
              className="mt-4 h-11 w-full sm:w-48"
              disabled={clave.length < 6 || verificando}
              variant="brand"
              onClick={desbloquear}
            >
              {verificando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Abrir documentación"
              )}
            </Button>
          </div>
        </Tarjeta>
      </Marco>
    );
  }

  /* ── Contenido ── */
  const decidida = data.status === "approved" || data.status === "rejected";

  return (
    <Marco>
      <Tarjeta>
        <div className="flex items-start gap-3">
          <FolderOpen
            className="mt-0.5 h-6 w-6 shrink-0"
            style={{ color: "var(--brand)" }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">{data.name}</h1>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {periodo ? `${periodo} · ` : ""}
              {data.documents?.length ?? 0} documento(s)
            </p>
          </div>
        </div>
        {data.notes && (
          <p
            className="mt-3 rounded-xl px-3 py-2 text-sm"
            style={{
              background: "var(--glass-sunken)",
              color: "var(--ink-soft)",
            }}
          >
            {data.notes}
          </p>
        )}
        {data.expiresAt && (
          <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
            Este enlace caduca el {new Date(data.expiresAt).toLocaleString()}.
          </p>
        )}
      </Tarjeta>

      <Tarjeta>
        <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {(data.documents || []).map((d) => (
            <div key={d.itemId} className="flex items-center gap-3 py-3">
              <FileText
                className="h-5 w-5 shrink-0"
                style={{ color: "var(--ink-faint)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {bytes(d.sizeInBytes)}
                  {d.downloadCount > 0 ? " · ya descargado" : ""}
                </div>
              </div>
              {/* Botón y no enlace: la descarga necesita reenviar la clave, y un
                  <a download> con la clave en el href la dejaría en el historial. */}
              <Button
                className="h-10 shrink-0"
                size="sm"
                variant="outline"
                onClick={() => descargar(d)}
              >
                <Download className="mr-1.5 h-4 w-4" /> Descargar
              </Button>
            </div>
          ))}
        </div>
      </Tarjeta>

      {/* ── Revisión ── */}
      <Tarjeta>
        {decidida ? (
          <div className="flex items-center gap-3">
            {data.status === "approved" ? (
              <CheckCircle2
                className="h-6 w-6"
                style={{ color: "var(--ok)" }}
              />
            ) : (
              <XCircle className="h-6 w-6" style={{ color: "var(--bad)" }} />
            )}
            <div>
              <div className="font-semibold">
                {data.status === "approved"
                  ? "Documentación aprobada"
                  : "Documentación rechazada"}
              </div>
              <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {data.decidedByName ? `${data.decidedByName} · ` : ""}
                {data.decisionAt
                  ? new Date(data.decisionAt).toLocaleString()
                  : ""}
              </div>
            </div>
          </div>
        ) : decidiendo ? (
          <div className="space-y-3">
            <div className="font-semibold">
              {decidiendo === "approved"
                ? "Aprobar documentación"
                : "Rechazar documentación"}
            </div>
            <input
              aria-label="Tu nombre"
              className="cg-input w-full px-3 py-2.5 text-sm"
              placeholder="Tu nombre y apellidos"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <textarea
              aria-label="Comentario"
              className="cg-input w-full px-3 py-2.5 text-sm"
              placeholder={
                decidiendo === "approved"
                  ? "Comentario (opcional)"
                  : "Motivo del rechazo"
              }
              rows={3}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
            {errorClave && (
              <p className="text-sm" style={{ color: "var(--bad-text)" }}>
                {errorClave}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-11 flex-1"
                disabled={
                  enviandoDecision ||
                  !nombre.trim() ||
                  (decidiendo === "rejected" && !comentario.trim())
                }
                variant={decidiendo === "approved" ? "brand" : "destructive"}
                onClick={decidir}
              >
                {enviandoDecision ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirmar"
                )}
              </Button>
              <Button
                className="h-11"
                disabled={enviandoDecision}
                variant="outline"
                onClick={() => setDecidiendo(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-semibold">¿Está todo correcto?</div>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              Tu respuesta queda registrada con fecha y nombre, y la ve tu
              proveedor de seguridad.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-11 flex-1"
                variant="brand"
                onClick={() => {
                  setDecidiendo("approved");
                  setErrorClave(null);
                }}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Aprobar
              </Button>
              <Button
                className="h-11 flex-1"
                variant="outline"
                onClick={() => {
                  setDecidiendo("rejected");
                  setErrorClave(null);
                }}
              >
                <XCircle className="mr-1.5 h-4 w-4" /> Rechazar
              </Button>
            </div>
          </div>
        )}
      </Tarjeta>
    </Marco>
  );
}
