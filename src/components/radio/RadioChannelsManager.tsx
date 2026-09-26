import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Check,
  Loader2,
  Pencil,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Section, EmptyState, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { roleDisplayName } from "@/config/roleLabels";
import {
  radioChannelService,
  type RadioChannel,
  type RadioChannelOptions,
  type RadioChannelType,
} from "@/lib/api/radioChannelService";

/**
 * Radio › Canales — el catálogo de canales de la empresa.
 *
 * Un canal se define por REGLAS, no por una lista de nombres que haya que
 * mantener a mano: estaciones (entra quien trabaje hoy ahí), roles (entra quien
 * lo tenga) y personas sueltas para las excepciones. Los cuatro casos que pide
 * la operación salen de combinarlas:
 *
 *   General        → toda la empresa (`scope: everyone`). Es el predeterminado
 *                    y no se borra: es al que se unen las apps al fichar.
 *   Administrativo → roles de oficina.
 *   Supervisores   → rol de supervisor.
 *   Por estaciones → las estaciones elegidas.
 *
 * Las PLANTILLAS de abajo son eso y sólo eso: rellenan el formulario al elegir
 * el tipo. Después se edita lo que se quiera — el tipo no impone nada, sólo
 * decide el icono.
 */

const ROLES_ADMIN = [
  "admin",
  "operationsManager",
  "administrativeSupervisor",
  "administrativeAssistant",
  "secretary",
  "hrManager",
  "clientAccountManager",
  "dispatcher",
];
const ROLES_SUPERVISION = ["securitySupervisor", "operationsManager"];

const PLANTILLAS: Record<
  RadioChannelType,
  {
    nombre: string;
    nombreKey?: string;
    descripcion: string;
    descripcionKey?: string;
    roles: string[];
  }
> = {
  // Keys + Spanish defaults; translated when the template fills the form.
  general: {
    nombre: "General",
    nombreKey: "ui.RadioChannelsManager.tipoGeneral",
    descripcion: "Canal abierto de toda la empresa.",
    descripcionKey: "ui.RadioChannelsManager.plantillaGeneralDescripcion",
    roles: [],
  },
  admin: {
    nombre: "Administrativo",
    nombreKey: "ui.RadioChannelsManager.tipoAdministrativo",
    descripcion: "Coordinación de oficina y dirección.",
    descripcionKey: "ui.RadioChannelsManager.plantillaAdminDescripcion",
    roles: ROLES_ADMIN,
  },
  supervisors: {
    nombre: "Supervisores",
    nombreKey: "ui.RadioChannelsManager.tipoSupervisores",
    descripcion: "Supervisión de campo y jefes de turno.",
    descripcionKey: "ui.RadioChannelsManager.plantillaSupervisoresDescripcion",
    roles: ROLES_SUPERVISION,
  },
  stations: {
    nombre: "",
    descripcion: "Comunicación de los puestos seleccionados.",
    descripcionKey: "ui.RadioChannelsManager.plantillaEstacionesDescripcion",
    roles: [],
  },
  custom: { nombre: "", descripcion: "", roles: [] },
};

const ICONO: Record<RadioChannelType, any> = {
  general: Radio,
  admin: Building2,
  supervisors: ShieldCheck,
  stations: Users,
  custom: Radio,
};

// Key + Spanish default; translated at render time.
const ETIQUETA_TIPO: Record<RadioChannelType, [string, string]> = {
  general: ["ui.RadioChannelsManager.tipoGeneral", "General"],
  admin: ["ui.RadioChannelsManager.tipoAdministrativo", "Administrativo"],
  supervisors: ["ui.RadioChannelsManager.tipoSupervisores", "Supervisores"],
  stations: ["ui.RadioChannelsManager.tipoPorEstaciones", "Por estaciones"],
  custom: ["ui.RadioChannelsManager.tipoPersonalizado", "Personalizado"],
};

type Form = {
  name: string;
  description: string;
  type: RadioChannelType;
  scope: "everyone" | "members";
  isDefault: boolean;
  active: boolean;
  stationIds: string[];
  roleSlugs: string[];
  userIds: string[];
};

const formVacio: Form = {
  name: "",
  description: "",
  type: "custom",
  scope: "members",
  isDefault: false,
  active: true,
  stationIds: [],
  roleSlugs: [],
  userIds: [],
};

/** Lista de casillas con buscador. Se usa igual para estaciones y personas. */
function Selector({
  titulo,
  vacio,
  items,
  seleccion,
  onToggle,
}: {
  titulo: string;
  vacio: string;
  items: { id: string; label: string; hint?: string | null }[];
  seleccion: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();

    if (!needle) return items;

    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        (i.hint || "").toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label>{titulo}</Label>
        <span className="text-[11px] text-muted-foreground">
          {t("ui.RadioChannelsManager.seleccionados", {
            defaultValue: "{{count}} seleccionados",
            count: seleccion.length,
          })}
        </span>
      </div>
      <div className="relative mb-1.5">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={14}
        />
        <Input
          className="h-8 pl-8 text-sm"
          placeholder={t("ui.RadioChannelsManager.buscar", "Buscar…")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
        {!filtrados.length ? (
          <p className="p-3 text-xs text-muted-foreground">{vacio}</p>
        ) : (
          filtrados.map((i) => {
            const puesto = seleccion.includes(i.id);

            return (
              <button
                key={i.id}
                className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
                type="button"
                onClick={() => onToggle(i.id)}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    puesto
                      ? "border-transparent bg-[var(--brand)] text-[var(--brand-ink)]"
                      : "border-border"
                  }`}
                >
                  {puesto && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {i.hint && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {i.hint}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function RadioChannelsManager({
  onChanged,
}: {
  /** Avisa a la pantalla de radio para que recargue su selector de canal. */
  onChanged?: () => void;
} = {}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const puedeGestionar = hasPermission("radioChannelManage");

  const [rows, setRows] = useState<RadioChannel[]>([]);
  const [opciones, setOpciones] = useState<RadioChannelOptions>({
    stations: [],
    roles: [],
    staff: [],
  });
  const [loading, setLoading] = useState(true);
  /* Un 403 aquí NO es «no hay canales»: es un permiso que falta. Se distinguen
     porque el vacío y el veto se arreglan de formas muy distintas. */
  const [sinPermiso, setSinPermiso] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<RadioChannel | null>(null);
  const [form, setForm] = useState<Form>(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<RadioChannel | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [lista, opts] = await Promise.all([
        radioChannelService.list(),
        radioChannelService.options().catch(() => ({
          stations: [],
          roles: [],
          staff: [],
        })),
      ]);

      setRows(lista);
      setOpciones(opts);
      setSinPermiso(false);
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.status === 403) setSinPermiso(true);
      else
        toast.error(
          t("radio.channels.loadError", "No se pudieron cargar los canales"),
        );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nuevo = () => {
    setEditando(null);
    setForm(formVacio);
    setAbierto(true);
  };
  const editar = (c: RadioChannel) => {
    setEditando(c);
    setForm({
      name: c.name,
      description: c.description || "",
      type: c.type,
      scope: c.scope,
      isDefault: c.isDefault,
      active: c.active,
      stationIds: c.stationIds || [],
      roleSlugs: c.roleSlugs || [],
      userIds: c.userIds || [],
    });
    setAbierto(true);
  };

  /** Al elegir tipo se rellena la plantilla — sólo si el campo sigue intacto. */
  const cambiarTipo = (type: RadioChannelType) => {
    const p = PLANTILLAS[type];

    setForm((f) => ({
      ...f,
      type,
      name: f.name || (p.nombreKey ? t(p.nombreKey, p.nombre) : p.nombre),
      description:
        f.description ||
        (p.descripcionKey ? t(p.descripcionKey, p.descripcion) : p.descripcion),
      roleSlugs: f.roleSlugs.length ? f.roleSlugs : p.roles,
      scope: type === "general" ? "everyone" : f.scope,
    }));
  };

  const alternar = (
    campo: "stationIds" | "roleSlugs" | "userIds",
    id: string,
  ) =>
    setForm((f) => ({
      ...f,
      [campo]: f[campo].includes(id)
        ? f[campo].filter((x) => x !== id)
        : [...f[campo], id],
    }));

  const sinReglas =
    form.scope !== "everyone" &&
    !form.stationIds.length &&
    !form.roleSlugs.length &&
    !form.userIds.length;

  const guardar = async () => {
    if (!form.name.trim()) {
      toast.error(t("radio.channels.needName", "Ponle un nombre al canal"));

      return;
    }
    if (sinReglas) {
      // Un canal sin reglas y sin «toda la empresa» no lo oiría NADIE salvo la
      // dirección. Mejor decirlo aquí que dejar que lo descubran en el aire.
      toast.error(
        t(
          "radio.channels.needMembers",
          "Elige al menos una estación, un rol o una persona (o marca «toda la empresa»).",
        ),
      );

      return;
    }
    setGuardando(true);
    try {
      if (editando) await radioChannelService.update(editando.id, form);
      else await radioChannelService.create(form);
      toast.success(
        editando
          ? t("radio.channels.saved", "Canal actualizado")
          : t("radio.channels.created", "Canal creado"),
      );
      setAbierto(false);
      await cargar();
      onChanged?.();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          e?.message ||
          t("comun.noSePudoGuardar", "No se pudo guardar"),
      );
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    try {
      await radioChannelService.remove(aBorrar.id);
      toast.success(t("radio.channels.deleted", "Canal eliminado"));
      await cargar();
      onChanged?.();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("comun.noSePudoEliminar", "No se pudo eliminar"),
      );
    } finally {
      setABorrar(null);
    }
  };

  const hacerPredeterminado = async (c: RadioChannel) => {
    try {
      await radioChannelService.update(c.id, { name: c.name, isDefault: true });
      toast.success(
        t("radio.channels.defaultSet", "Ahora es el canal predeterminado"),
      );
      await cargar();
      onChanged?.();
    } catch {
      toast.error(t("comun.noSePudoGuardar", "No se pudo guardar"));
    }
  };

  const resumen = (c: RadioChannel): string => {
    if (c.scope === "everyone")
      return t("ui.RadioChannelsManager.todaLaEmpresa", "Toda la empresa");
    const partes: string[] = [];

    if (c.stationIds?.length)
      partes.push(
        t("ui.RadioChannelsManager.nEstaciones", {
          defaultValue: "{{count}} estaciones",
          count: c.stationIds.length,
        }),
      );
    if (c.roleSlugs?.length)
      partes.push(c.roleSlugs.map((r) => roleDisplayName(r)).join(", "));
    if (c.userIds?.length)
      partes.push(
        t("ui.RadioChannelsManager.nPersonas", {
          defaultValue: "{{count}} personas",
          count: c.userIds.length,
        }),
      );

    return (
      partes.join(" · ") ||
      t("ui.RadioChannelsManager.sinMiembros", "Sin miembros")
    );
  };

  return (
    <>
      <Section
        action={
          puedeGestionar ? (
            <Button size="sm" variant="brand" onClick={nuevo}>
              <Plus size={14} />{" "}
              {t("ui.RadioChannelsManager.nuevoCanal", "Nuevo canal")}
            </Button>
          ) : undefined
        }
        icon={<Radio />}
        title={t("radio.channels.title", "Canales de radio")}
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : sinPermiso ? (
          <EmptyState
            description={t(
              "ui.RadioChannelsManager.sinAccesoDescripcion",
              "Tu rol no tiene acceso a los canales de radio. Pídele a un administrador que te lo habilite en Configuración › Roles.",
            )}
            icon={<Radio />}
            title={t(
              "ui.RadioChannelsManager.sinAccesoALosCanales",
              "Sin acceso a los canales",
            )}
          />
        ) : !rows.length ? (
          <EmptyState
            icon={<Radio />}
            title={t("radio.channels.empty", "Aún no hay canales")}
          />
        ) : (
          <div className="space-y-2">
            {rows.map((c) => {
              const Icono = ICONO[c.type] || Radio;

              return (
                <div key={c.id} className="cg-card p-3">
                  <div className="flex items-center gap-3">
                    <Icono
                      className="shrink-0"
                      size={18}
                      style={{ color: "var(--brand-text)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">{c.name}</p>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {c.key}
                        </span>
                        {c.isDefault && (
                          <StatusBadge tone="green">
                            {t("ui.RadioChannelsManager.predeterminado", "Predeterminado")}
                          </StatusBadge>
                        )}
                        {!c.active && (
                          <StatusBadge tone="slate">
                            {t("ui.RadioChannelsManager.inactivo", "Inactivo")}
                          </StatusBadge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {ETIQUETA_TIPO[c.type]
                          ? t(ETIQUETA_TIPO[c.type][0], ETIQUETA_TIPO[c.type][1])
                          : c.type}{" "}
                        · {resumen(c)}
                      </p>
                    </div>
                    {puedeGestionar && (
                      <div className="flex shrink-0 items-center gap-1">
                        {!c.isDefault && (
                          <Button
                            size="icon"
                            title={t(
                              "ui.RadioChannelsManager.hacerPredeterminado",
                              "Hacer predeterminado",
                            )}
                            variant="outline"
                            onClick={() => hacerPredeterminado(c)}
                          >
                            <Star size={14} />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          title={t("ui.RadioChannelsManager.editar", "Editar")}
                          variant="outline"
                          onClick={() => editar(c)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          disabled={c.isDefault}
                          size="icon"
                          title={
                            c.isDefault
                              ? t(
                                  "ui.RadioChannelsManager.predeterminadoNoSeElimina",
                                  "El canal predeterminado no se elimina",
                                )
                              : t("ui.RadioChannelsManager.eliminar", "Eliminar")
                          }
                          variant="outline"
                          onClick={() => setABorrar(c)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando
                ? t("ui.RadioChannelsManager.editarCanal", "Editar canal")
                : t("ui.RadioChannelsManager.nuevoCanalDeRadio", "Nuevo canal de radio")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "ui.RadioChannelsManager.eligeQuienEntra",
                "Elige quién entra: estaciones, roles o personas concretas. Quien cumpla una sola de las reglas ya pertenece al canal.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t("ui.RadioChannelsManager.tipo", "Tipo")}</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(
                  [
                    "general",
                    "admin",
                    "supervisors",
                    "stations",
                    "custom",
                  ] as RadioChannelType[]
                ).map((tp) => {
                  const Icono = ICONO[tp];
                  const activo = form.type === tp;

                  return (
                    <button
                      key={tp}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activo
                          ? "border-transparent bg-[var(--brand)] text-[var(--brand-ink)]"
                          : "border-border hover:bg-muted"
                      }`}
                      disabled={!!editando && editando.type === "general"}
                      type="button"
                      onClick={() => cambiarTipo(tp)}
                    >
                      <Icono size={13} />{" "}
                      {t(ETIQUETA_TIPO[tp][0], ETIQUETA_TIPO[tp][1])}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("ui.RadioChannelsManager.nombre", "Nombre")}</Label>
                <Input
                  className="mt-1.5"
                  placeholder={t(
                    "ui.RadioChannelsManager.canalDeSupervisores",
                    "Canal de supervisores",
                  )}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  {t("ui.RadioChannelsManager.descripcion", "Descripción")}
                </Label>
                <Textarea
                  className="mt-1.5"
                  rows={1}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 text-sm">
              <label className="flex items-center gap-2 font-medium">
                <input
                  checked={form.scope === "everyone"}
                  disabled={editando?.key === "general"}
                  type="checkbox"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scope: e.target.checked ? "everyone" : "members",
                    })
                  }
                />
                {t("ui.RadioChannelsManager.todaLaEmpresa", "Toda la empresa")}
              </label>
              <p className="mt-1 pl-6 text-xs text-muted-foreground">
                {t(
                  "ui.RadioChannelsManager.entraTodoElPersonal",
                  "Entra todo el personal operativo (vigilante o superior). Es como funciona el canal general.",
                )}
              </p>
            </div>

            {form.scope !== "everyone" && (
              <>
                <Selector
                  items={opciones.stations.map((s) => ({
                    id: s.id,
                    label: s.name,
                    hint: s.nickname,
                  }))}
                  seleccion={form.stationIds}
                  titulo={t("ui.RadioChannelsManager.estaciones", "Estaciones")}
                  vacio={t(
                    "ui.RadioChannelsManager.noHayEstaciones",
                    "No hay estaciones registradas.",
                  )}
                  onToggle={(id) => alternar("stationIds", id)}
                />

                <div>
                  <Label>{t("ui.RadioChannelsManager.roles", "Roles")}</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {opciones.roles.map((r) => {
                      const puesto = form.roleSlugs.includes(r.slug);

                      return (
                        <button
                          key={r.slug}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            puesto
                              ? "border-transparent bg-[var(--brand)] text-[var(--brand-ink)]"
                              : "border-border hover:bg-muted"
                          }`}
                          type="button"
                          onClick={() => alternar("roleSlugs", r.slug)}
                        >
                          {roleDisplayName(r.slug)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Selector
                  items={opciones.staff.map((u) => ({
                    id: u.id,
                    label: u.name,
                    hint: u.roles?.[0] ? roleDisplayName(u.roles[0]) : null,
                  }))}
                  seleccion={form.userIds}
                  titulo={t("ui.RadioChannelsManager.personas", "Personas")}
                  vacio={t(
                    "ui.RadioChannelsManager.noHayPersonalConRadio",
                    "No hay personal con radio.",
                  )}
                  onToggle={(id) => alternar("userIds", id)}
                />
              </>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={form.isDefault}
                  disabled={editando?.isDefault}
                  type="checkbox"
                  onChange={(e) =>
                    setForm({ ...form, isDefault: e.target.checked })
                  }
                />
                {t("ui.RadioChannelsManager.canalPredeterminado", "Canal predeterminado")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={form.active}
                  disabled={form.isDefault || editando?.isDefault}
                  type="checkbox"
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                {t("ui.RadioChannelsManager.activo", "Activo")}
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              {t("ui.RadioChannelsManager.cancelar", "Cancelar")}
            </Button>
            <Button disabled={guardando} variant="brand" onClick={guardar}>
              {guardando && <Loader2 className="animate-spin" size={14} />}{" "}
              {editando
                ? t("ui.RadioChannelsManager.guardar", "Guardar")
                : t("ui.RadioChannelsManager.crearCanal", "Crear canal")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!aBorrar}
        onOpenChange={(v) => !v && setABorrar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ui.RadioChannelsManager.eliminarCanal", "Eliminar canal")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ui.RadioChannelsManager.dejaraDeExistir", {
                defaultValue:
                  "«{{name}}» dejará de existir. Quien esté dentro saldrá al canal predeterminado en su próxima conexión.",
                name: aBorrar?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("ui.RadioChannelsManager.cancelar", "Cancelar")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={borrar}>
              {t("ui.RadioChannelsManager.eliminar", "Eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
