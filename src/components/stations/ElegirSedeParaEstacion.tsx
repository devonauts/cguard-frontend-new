import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  ShieldPlus,
  Wrench,
} from "lucide-react";

import { Modal, SmartImage, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { clientService } from "@/lib/api/clientService";

/**
 * «AGREGAR ESTACIÓN» DESDE LA LISTA GLOBAL DE ESTACIONES.
 *
 * Una estación siempre es de una sede de un cliente, así que antes del
 * formulario hay que decir de cuál: primero el cliente (con su logo, para
 * reconocerlo de un vistazo), luego su sede. Si la sede todavía no está
 * configurada, no se crean estaciones: el botón lleva a configurarla.
 */
type Cliente = {
  id: string;
  nombre: string;
  logo: string | null;
  direccion?: string;
};
type Sede = {
  id: string;
  nombre: string;
  direccion: string;
  pendiente: boolean;
  estaciones: number;
};

const sinAcentos = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

function logoDe(c: any): string | null {
  const cand = c?.logoUrl;

  if (Array.isArray(cand))
    return cand[0]?.downloadUrl || cand[0]?.publicUrl || null;
  if (typeof cand === "string") return cand || null;

  return (cand && (cand.downloadUrl || cand.publicUrl)) || null;
}

function Avatar({
  nombre,
  logo,
  grande,
}: {
  nombre: string;
  logo: string | null;
  grande?: boolean;
}) {
  const lado = grande ? "h-14 w-14" : "h-10 w-10";

  return (
    <SmartImage
      alt=""
      className={`${lado} shrink-0 rounded-xl border`}
      fallback={
        <span
          className={`grid h-full w-full place-items-center rounded-xl font-bold ${grande ? "text-xl" : "text-base"}`}
          style={{
            background: "var(--brand-wash)",
            color: "var(--brand-text)",
          }}
        >
          {nombre.charAt(0).toUpperCase()}
        </span>
      }
      src={logo || undefined}
      style={{ borderColor: "var(--hairline)" }}
    />
  );
}

export default function ElegirSedeParaEstacion({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [sedes, setSedes] = useState<Sede[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let viva = true;

    setCargando(true);
    setCliente(null);
    setSedes(null);
    setBusca("");
    (async () => {
      try {
        const r: any = await clientService.getClients(
          {} as any,
          { limit: 200, offset: 0 } as any,
        );
        const filas: any[] = Array.isArray(r?.rows) ? r.rows : [];
        const base: Cliente[] = filas.map((c) => ({
          id: c.id,
          nombre:
            c.commercialName ||
            [c.name, c.lastName].filter(Boolean).join(" ") ||
            "?",
          logo: logoDe(c),
          direccion: c.address || "",
        }));

        if (viva) setClientes(base);
        /* El listado trae el logo sin firmar (o sin él). La ficha sí lo firma:
           se completa para los que no lo tienen, sin bloquear la lista. */
        const sinLogo = base.filter((c) => !c.logo).slice(0, 40);

        await Promise.all(
          sinLogo.map(async (c) => {
            try {
              const d: any = await clientService.getClient(c.id);
              const logo = logoDe(d);

              if (logo && viva)
                setClientes((xs) =>
                  xs.map((x) => (x.id === c.id ? { ...x, logo } : x)),
                );
            } catch {
              /* sin logo */
            }
          }),
        );
      } catch {
        if (viva) setClientes([]);
      } finally {
        if (viva) setCargando(false);
      }
    })();

    return () => {
      viva = false;
    };
  }, [open]);

  const elegirCliente = async (c: Cliente) => {
    setCliente(c);
    setSedes(null);
    try {
      const op: any = await clientService.getOperation(c.id);
      const lista: Sede[] = (op?.sites || [])
        .filter((s: any) => s?.id && s.id !== "__loose__")
        .map((s: any) => ({
          id: String(s.id),
          nombre: s.companyName || s.name || c.nombre,
          direccion: [s.address, s.city].filter(Boolean).join(", "),
          pendiente: !!s.setup?.pending,
          estaciones: Array.isArray(s.stations) ? s.stations.length : 0,
        }));

      setSedes(lista);
    } catch {
      setSedes([]);
    }
  };

  const visibles = useMemo(() => {
    const q = sinAcentos(busca.trim().toLowerCase());

    return q
      ? clientes.filter((c) => sinAcentos(c.nombre.toLowerCase()).includes(q))
      : clientes;
  }, [clientes, busca]);

  const ir = (s: Sede) => {
    onOpenChange(false);
    navigate(
      s.pendiente
        ? `/post-sites/${s.id}/edit?step=1`
        : `/post-sites/${s.id}/stations/new`,
    );
  };

  return (
    <Modal
      description={
        cliente
          ? t("ui.ElegirSede.enQueSede", "¿En qué sede de este cliente?")
          : t(
              "ui.ElegirSede.deQueCliente",
              "Una estación siempre es de una sede. ¿De qué cliente?",
            )
      }
      icon={<ShieldPlus className="h-5 w-5" />}
      open={open}
      size="lg"
      title={
        cliente ? (
          <span className="inline-flex items-center gap-2">
            <Avatar logo={cliente.logo} nombre={cliente.nombre} />
            {cliente.nombre}
          </span>
        ) : (
          t("ui.ElegirSede.agregarEstacion", "Agregar estación")
        )
      }
      onOpenChange={onOpenChange}
    >
      {!cliente ? (
        <div className="space-y-3">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              size={14}
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="off"
              className="cg-input cg-focus h-10 w-full pl-9 pr-3 text-sm"
              placeholder={t("ui.ElegirSede.buscarCliente", "Buscar cliente…")}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          {cargando && !clientes.length ? (
            <div className="flex justify-center py-10">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: "var(--brand-text)" }}
              />
            </div>
          ) : !visibles.length ? (
            <div
              className="py-8 text-center text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              {clientes.length
                ? t(
                    "ui.ElegirSede.sinResultados",
                    "Ningún cliente con ese nombre.",
                  )
                : t(
                    "ui.ElegirSede.sinClientes",
                    "Todavía no hay clientes. Crea el primero y su sede.",
                  )}
              {!clientes.length && (
                <div className="mt-3">
                  <Button
                    variant="brand"
                    onClick={() => {
                      onOpenChange(false);
                      navigate("/clients/add-new");
                    }}
                  >
                    {t("ui.ElegirSede.nuevoCliente", "Nuevo cliente")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid max-h-[60dvh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {visibles.map((c) => (
                <button
                  key={c.id}
                  className="cg-focus glass-flat flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-[var(--brand-line)]"
                  type="button"
                  onClick={() => void elegirCliente(c)}
                >
                  <Avatar grande logo={c.logo} nombre={c.nombre} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {c.nombre}
                    </span>
                    {c.direccion && (
                      <span
                        className="block truncate text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {c.direccion}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--ink-faint)" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <button
            className="cg-focus inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--brand-text)" }}
            type="button"
            onClick={() => {
              setCliente(null);
              setSedes(null);
            }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("ui.ElegirSede.otroCliente", "Otro cliente")}
          </button>
          {sedes === null ? (
            <div className="flex justify-center py-10">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: "var(--brand-text)" }}
              />
            </div>
          ) : !sedes.length ? (
            <div
              className="py-8 text-center text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "ui.ElegirSede.sinSedes",
                "Este cliente no tiene sedes todavía.",
              )}
              <div className="mt-3">
                <Button
                  variant="brand"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/post-sites/new?clientId=${cliente.id}`, {
                      state: { clientName: cliente.nombre },
                    });
                  }}
                >
                  {t("ui.ElegirSede.crearSede", "Crear sede")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
              {sedes.map((s) => (
                <div
                  key={s.id}
                  className="glass-flat flex flex-wrap items-center gap-3 rounded-xl p-3"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: "var(--glass-sunken)",
                      color: "var(--ink-soft)",
                    }}
                  >
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {s.nombre}
                      </span>
                      {s.pendiente ? (
                        <StatusBadge dot={false} tone="warn">
                          {t(
                            "ui.OperationSetupAlert.faltaConfigurar",
                            "Falta configurar",
                          )}
                        </StatusBadge>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t("ui.ElegirSede.nEstaciones", {
                            defaultValue: "{{count}} estación(es)",
                            count: s.estaciones,
                          })}
                        </span>
                      )}
                    </span>
                    {s.direccion && (
                      <span
                        className="flex items-center gap-1 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        <MapPin className="h-3 w-3" /> {s.direccion}
                      </span>
                    )}
                  </span>
                  <Button
                    className="gap-1.5"
                    size="sm"
                    variant={s.pendiente ? "outline" : "brand"}
                    onClick={() => ir(s)}
                  >
                    {s.pendiente ? (
                      <>
                        <Wrench className="h-3.5 w-3.5" />
                        {t(
                          "ui.OperationSetupAlert.configurarLaSede",
                          "Configurar la sede",
                        )}
                      </>
                    ) : (
                      <>
                        <ShieldPlus className="h-3.5 w-3.5" />
                        {t("ui.ElegirSede.crearAqui", "Crear estación aquí")}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
