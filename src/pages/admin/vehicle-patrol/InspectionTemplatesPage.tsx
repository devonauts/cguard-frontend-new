import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  Star,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  SlidersHorizontal,
  Eye,
  EyeOff,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  EmptyState,
  ListRow,
  SkeletonCards,
  Modal,
  FormField,
  InfoNote,
  GlassPanel,
} from "@/components/kit";
import InspectionPreview from "./InspectionPreview";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import routeInspectionTemplateService, {
  type InspectionTemplate,
  type TemplateContent,
  type TemplateItem,
  type TemplateSection,
  type ItemType,
} from "@/lib/api/routeInspectionTemplateService";

/**
 * PLANTILLAS DE INSPECCIÓN de las paradas de supervisión. Lo que el
 * supervisor contesta en cada puesto. Cada cambio de contenido crea una
 * VERSIÓN nueva: las visitas ya hechas guardan su instantánea, así que editar
 * nunca reescribe la historia.
 */
const TIPOS: Array<{ value: ItemType; label: string }> = [
  { value: "yes_no", label: "Sí / No" },
  { value: "pass_fail", label: "Pasa / Falla" },
  { value: "boolean", label: "Interruptor" },
  { value: "checkbox", label: "Casilla" },
  { value: "acknowledgement", label: "Confirmación" },
  { value: "slider", label: "Escala deslizante" },
  { value: "rating", label: "Estrellas" },
  { value: "number", label: "Número" },
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "single_select", label: "Opción única" },
  { value: "multi_select", label: "Varias opciones" },
  { value: "photo", label: "Foto" },
  { value: "signature", label: "Firma" },
  { value: "date", label: "Fecha" },
  { value: "time", label: "Hora" },
  { value: "datetime", label: "Fecha y hora" },
  { value: "guard_selector", label: "Selector de vigilante" },
];
const ESCALABLES = new Set(["slider", "rating", "number"]);
const CON_OPCIONES = new Set(["single_select", "multi_select"]);
const FALLABLES = new Set([
  "yes_no",
  "pass_fail",
  "boolean",
  "checkbox",
  "acknowledgement",
  "single_select",
  "slider",
  "rating",
  "number",
]);
const GRAVEDAD: Array<{ value: string; label: string }> = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];
const nuevoId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 7)}`;

/* El `Select` de Radix no admite un elemento con valor vacío: «siempre» lleva
   un centinela que se traduce a «sin condición». */
const SIEMPRE = "__siempre__";

export default function InspectionTemplatesPage() {
  const { t } = useTranslation();

  usePageTitle("Plantillas de inspección");
  const [rows, setRows] = useState<InspectionTemplate[] | null>(null);
  const [editing, setEditing] = useState<InspectionTemplate | "new" | null>(
    null,
  );
  const [factory, setFactory] = useState<TemplateContent | null>(null);

  const load = async () => {
    try {
      const [lista, cat] = await Promise.all([
        routeInspectionTemplateService.list(),
        routeInspectionTemplateService.catalog().catch(() => null),
      ]);

      setRows(lista);
      if (cat) setFactory(cat.factoryDefault);
    } catch (e: any) {
      toast.error(e?.message || "Error");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const marcarDefecto = async (tpl: InspectionTemplate) => {
    try {
      await routeInspectionTemplateService.update(tpl.id, { isDefault: true });
      toast.success(
        t(
          "ui.InspectionTemplates.defectoOk",
          "Ahora es la plantilla por defecto",
        ),
      );
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Error");
    }
  };
  const borrar = async (tpl: InspectionTemplate) => {
    if (
      !(await confirmDialog({
        title: t(
          "ui.InspectionTemplates.borrarTitulo",
          "Desactivar «{{name}}»",
          { name: tpl.name },
        ),
        message: t(
          "ui.InspectionTemplates.borrarMsg",
          "Las paradas que la usan pasarán a la plantilla por defecto. Las visitas ya hechas conservan su copia.",
        ),
        confirmText: "Desactivar",
      }))
    )
      return;
    try {
      await routeInspectionTemplateService.destroy(tpl.id);
      toast.success(
        t("ui.InspectionTemplates.borradaOk", "Plantilla desactivada"),
      );
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Error");
    }
  };
  const duplicar = (tpl: InspectionTemplate) =>
    setEditing({
      ...tpl,
      id: "",
      name: `${tpl.name} (copia)`,
      isDefault: false,
      version: 1,
    });

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Patrulla vehicular", path: "/vehicle-patrol" },
          { label: "Plantillas de inspección" },
        ]}
      />
      <PageContainer>
        <PageHeader
          actions={
            <Button variant="brand" onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t("ui.InspectionTemplates.nueva", "Nueva plantilla")}
            </Button>
          }
          icon={<ClipboardList />}
          subtitle={t(
            "ui.InspectionTemplates.sub",
            "Lo que el supervisor revisa y contesta en cada parada de su ruta.",
          )}
          title={t("ui.InspectionTemplates.titulo", "Plantillas de inspección")}
        />
        <InfoNote tone="info">
          {t(
            "ui.InspectionTemplates.nota",
            "Cada plantilla se asigna por ruta o por parada al editar la ruta. Si no se asigna ninguna, se usa la marcada por defecto. Editar una plantilla crea una versión nueva; las visitas anteriores no cambian.",
          )}
        </InfoNote>
        <Section
          icon={<ClipboardList />}
          title={t("ui.InspectionTemplates.lista", "Plantillas")}
        >
          {rows === null ? (
            <SkeletonCards count={3} />
          ) : rows.length === 0 ? (
            <EmptyState
              action={
                <Button variant="outline" onClick={() => setEditing("new")}>
                  <Plus className="size-4" />
                  {t("ui.InspectionTemplates.nueva", "Nueva plantilla")}
                </Button>
              }
              description={t(
                "ui.InspectionTemplates.vacioSub",
                "Crea la primera y márcala por defecto: será la que contesten los supervisores en cada parada.",
              )}
              icon={<ClipboardList />}
              title={t("ui.InspectionTemplates.vacio", "Sin plantillas")}
              variant="inline"
            />
          ) : (
            <div className="space-y-1">
              {rows.map((tpl) => {
                const items = (tpl.content?.sections || []).reduce(
                  (n, s) => n + (s.items?.length || 0),
                  0,
                );

                return (
                  <ListRow
                    key={tpl.id}
                    actions={
                      <>
                        {!tpl.isDefault && (
                          <Button
                            aria-label={t(
                              "ui.InspectionTemplates.marcarDefecto",
                              "Usar por defecto",
                            )}
                            size="icon-sm"
                            title={t(
                              "ui.InspectionTemplates.marcarDefecto",
                              "Usar por defecto",
                            )}
                            variant="ghost"
                            onClick={() => marcarDefecto(tpl)}
                          >
                            <Star className="size-4" />
                          </Button>
                        )}
                        <Button
                          aria-label={t(
                            "ui.InspectionTemplates.duplicar",
                            "Duplicar",
                          )}
                          size="icon-sm"
                          title={t(
                            "ui.InspectionTemplates.duplicar",
                            "Duplicar",
                          )}
                          variant="ghost"
                          onClick={() => duplicar(tpl)}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(tpl)}
                        >
                          <Pencil className="size-3.5" />
                          {t("comun.editar", "Editar")}
                        </Button>
                        {!tpl.isDefault && (
                          <Button
                            aria-label={t(
                              "ui.InspectionTemplates.desactivar",
                              "Desactivar",
                            )}
                            size="icon-sm"
                            title={t(
                              "ui.InspectionTemplates.desactivar",
                              "Desactivar",
                            )}
                            variant="danger-ghost"
                            onClick={() => borrar(tpl)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </>
                    }
                    badges={
                      tpl.isDefault ? (
                        <StatusBadge tone="brand">
                          {t(
                            "ui.InspectionTemplates.porDefecto",
                            "Por defecto",
                          )}
                        </StatusBadge>
                      ) : null
                    }
                    subtitle={[
                      t("ui.InspectionTemplates.secciones", "{{n}} secciones", {
                        n: tpl.content?.sections?.length || 0,
                      }),
                      t("ui.InspectionTemplates.items", "{{n}} preguntas", {
                        n: items,
                      }),
                      `v${tpl.version}`,
                      tpl.description,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    title={tpl.name}
                  />
                );
              })}
            </div>
          )}
        </Section>
      </PageContainer>
      {editing && (
        <EditorModal
          factory={factory}
          tpl={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </AppLayout>
  );
}

/** Casilla con su etiqueta atada — la pareja `Checkbox` + `Label` del kit. */
function Casilla({
  id,
  checked,
  onChange,
  children,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <Label className="cursor-pointer text-sm font-normal" htmlFor={id}>
        {children}
      </Label>
    </div>
  );
}

function EditorModal({
  tpl,
  factory,
  onClose,
  onSaved,
}: {
  tpl: InspectionTemplate | null;
  factory: TemplateContent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const uid = useId();
  const esNueva = !tpl?.id;
  const [name, setName] = useState(tpl?.name || "");
  const [description, setDescription] = useState(tpl?.description || "");
  const [isDefault, setIsDefault] = useState(tpl?.isDefault || false);
  const [content, setContent] = useState<TemplateContent>(() =>
    tpl?.content
      ? JSON.parse(JSON.stringify(tpl.content))
      : factory
        ? JSON.parse(JSON.stringify(factory))
        : {
            settings: {},
            sections: [{ id: nuevoId("sec"), title: "Sección 1", items: [] }],
          },
  );
  const [saving, setSaving] = useState(false);
  // La vista previa nace ABIERTA: el problema que resuelve —no saber cómo queda
  // el formulario en el teléfono— sólo lo ve quien la tiene delante. Se puede
  // cerrar para ganar ancho en pantallas pequeñas.
  const [previa, setPrevia] = useState(true);
  const setSettings = (p: Partial<NonNullable<TemplateContent["settings"]>>) =>
    setContent((c) => ({ ...c, settings: { ...(c.settings || {}), ...p } }));
  const setSection = (i: number, fn: (s: TemplateSection) => TemplateSection) =>
    setContent((c) => ({
      ...c,
      sections: c.sections.map((s, j) => (j === i ? fn(s) : s)),
    }));
  const setItem = (
    si: number,
    ii: number,
    fn: (it: TemplateItem) => TemplateItem,
  ) =>
    setSection(si, (s) => ({
      ...s,
      items: s.items.map((it, j) => (j === ii ? fn(it) : it)),
    }));
  const mover = <T,>(arr: T[], i: number, d: number) => {
    const j = i + d;

    if (j < 0 || j >= arr.length) return arr;
    const c = arr.slice();

    [c[i], c[j]] = [c[j], c[i]];

    return c;
  };
  const todosItems = content.sections.flatMap((s) => s.items);

  const save = async () => {
    if (!name.trim()) {
      toast.error(
        t(
          "ui.InspectionTemplates.nombreReq",
          "La plantilla necesita un nombre",
        ),
      );

      return;
    }
    if (!todosItems.length) {
      toast.error(
        t("ui.InspectionTemplates.itemsReq", "Añade al menos una pregunta"),
      );

      return;
    }
    setSaving(true);
    try {
      if (esNueva)
        await routeInspectionTemplateService.create({
          name: name.trim(),
          description: description.trim() || undefined,
          content,
          isDefault,
        });
      else
        await routeInspectionTemplateService.update(tpl!.id, {
          name: name.trim(),
          description: description.trim(),
          content,
          isDefault,
        });
      toast.success(
        esNueva
          ? t("ui.InspectionTemplates.creada", "Plantilla creada")
          : t(
              "ui.InspectionTemplates.guardada",
              "Plantilla guardada (versión nueva si cambió el contenido)",
            ),
      );
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      description={
        esNueva
          ? t(
              "ui.InspectionTemplates.nuevaSub",
              "Lo que el supervisor contesta en cada parada.",
            )
          : t(
              "ui.InspectionTemplates.version",
              "Versión {{v}} · al guardar cambios de contenido se crea la siguiente",
              { v: tpl!.version },
            )
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("comun.cancelar", "Cancelar")}
          </Button>
          <Button disabled={saving} variant="brand" onClick={save}>
            {saving
              ? t("comun.guardando", "Guardando…")
              : t("comun.guardar", "Guardar")}
          </Button>
        </>
      }
      icon={<ClipboardList />}
      size="xl"
      title={
        esNueva
          ? t("ui.InspectionTemplates.nueva", "Nueva plantilla")
          : tpl!.name
      }
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      {/* ── EDITOR A LA IZQUIERDA, TELÉFONO A LA DERECHA ──────────────────
          Una plantilla se escribe como una lista de campos y se contesta como
          un formulario de pie, de noche, en un puesto. Quien la escribe no
          puede juzgar si funciona mirando la lista: tiene que ver el paso.
          En pantallas estrechas el teléfono baja debajo, no compite por el
          ancho con lo que se está editando. */}
      <div className={previa ? "grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}>
      <div className="space-y-5">
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant={previa ? "brand" : "outline"}
            onClick={() => setPrevia((v) => !v)}
          >
            {previa ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {previa
              ? t("ui.InspectionTemplates.ocultarPrevia", "Ocultar vista previa")
              : t("ui.InspectionTemplates.verPrevia", "Ver vista previa")}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            required
            htmlFor={`${uid}-nombre`}
            label={t("ui.InspectionTemplates.nombre", "Nombre")}
          >
            <Input
              id={`${uid}-nombre`}
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField
            htmlFor={`${uid}-desc`}
            label={t("ui.InspectionTemplates.descripcion", "Descripción")}
          >
            <Input
              id={`${uid}-desc`}
              maxLength={255}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>

        {/* Reglas de la plantilla entera: un pozo hundido, como el detalle de
            una fila de Ajustes. */}
        <div className="glass-sunken flex flex-wrap items-center gap-x-6 gap-y-3 p-3">
          <Casilla
            checked={isDefault}
            id={`${uid}-def`}
            onChange={setIsDefault}
          >
            {t("ui.InspectionTemplates.usarPorDefecto", "Usar por defecto")}
          </Casilla>
          <Casilla
            checked={!!content.settings?.requireGuardVerification}
            id={`${uid}-personal`}
            onChange={(v) => setSettings({ requireGuardVerification: v })}
          >
            {t(
              "ui.InspectionTemplates.exigirPersonal",
              "Exigir verificar al personal",
            )}
          </Casilla>
          <Casilla
            checked={!!content.settings?.requireNotes}
            id={`${uid}-notas`}
            onChange={(v) => setSettings({ requireNotes: v })}
          >
            {t("ui.InspectionTemplates.exigirNotas", "Exigir notas")}
          </Casilla>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-normal" htmlFor={`${uid}-fotos`}>
              {t("ui.InspectionTemplates.fotosMin", "Fotos mínimas")}
            </Label>
            <Input
              className="w-20 text-right"
              id={`${uid}-fotos`}
              max={20}
              min={0}
              type="number"
              value={content.settings?.minPhotos ?? 0}
              onChange={(e) =>
                setSettings({ minPhotos: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        {content.sections.map((sec, si) => (
          <GlassPanel key={sec.id} flat className="p-4">
            <div className="flex items-center gap-2">
              <Input
                aria-label={t(
                  "ui.InspectionTemplates.tituloSeccion",
                  "Título de la sección",
                )}
                className="font-semibold"
                maxLength={120}
                placeholder={t(
                  "ui.InspectionTemplates.tituloSeccion",
                  "Título de la sección",
                )}
                value={sec.title}
                onChange={(e) =>
                  setSection(si, (s) => ({ ...s, title: e.target.value }))
                }
              />
              <Button
                aria-label={t(
                  "ui.InspectionTemplates.subirSeccion",
                  "Subir sección",
                )}
                disabled={si === 0}
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  setContent((c) => ({
                    ...c,
                    sections: mover(c.sections, si, -1),
                  }))
                }
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                aria-label={t(
                  "ui.InspectionTemplates.bajarSeccion",
                  "Bajar sección",
                )}
                disabled={si === content.sections.length - 1}
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  setContent((c) => ({
                    ...c,
                    sections: mover(c.sections, si, 1),
                  }))
                }
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                aria-label={t(
                  "ui.InspectionTemplates.quitarSeccion",
                  "Quitar sección",
                )}
                size="icon-sm"
                variant="danger-ghost"
                onClick={() =>
                  setContent((c) => ({
                    ...c,
                    sections: c.sections.filter((_, j) => j !== si),
                  }))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {sec.items.map((it, ii) => (
                <ItemEditor
                  key={it.id}
                  first={ii === 0}
                  it={it}
                  last={ii === sec.items.length - 1}
                  otros={todosItems.filter((x) => x.id !== it.id)}
                  onChange={(fn) => setItem(si, ii, fn)}
                  onMove={(d) =>
                    setSection(si, (s) => ({
                      ...s,
                      items: mover(s.items, ii, d),
                    }))
                  }
                  onRemove={() =>
                    setSection(si, (s) => ({
                      ...s,
                      items: s.items.filter((_, j) => j !== ii),
                    }))
                  }
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSection(si, (s) => ({
                    ...s,
                    items: [
                      ...s.items,
                      {
                        id: nuevoId("it"),
                        type: "yes_no",
                        label: "",
                        required: true,
                        clientVisible: true,
                        weight: 1,
                      },
                    ],
                  }))
                }
              >
                <Plus className="size-3.5" />
                {t("ui.InspectionTemplates.agregarItem", "Añadir pregunta")}
              </Button>
            </div>
          </GlassPanel>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            setContent((c) => ({
              ...c,
              sections: [
                ...c.sections,
                {
                  id: nuevoId("sec"),
                  title: `Sección ${c.sections.length + 1}`,
                  items: [],
                },
              ],
            }))
          }
        >
          <Plus className="size-4" />
          {t("ui.InspectionTemplates.agregarSeccion", "Añadir sección")}
        </Button>
      </div>
        {previa && (
          <div className="lg:sticky lg:top-2 lg:self-start">
            <InspectionPreview content={content} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Una pregunta de la plantilla. La primera línea es lo que se toca a diario
 * (texto y tipo); las reglas finas —peso, escala, opciones, qué pasa al
 * fallar, cuándo se muestra— quedan plegadas detrás de «Ajustes».
 */
function ItemEditor({
  it,
  otros,
  onChange,
  onMove,
  onRemove,
  first,
  last,
}: {
  it: TemplateItem;
  otros: TemplateItem[];
  onChange: (fn: (it: TemplateItem) => TemplateItem) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  const { t } = useTranslation();
  const uid = useId();
  const [mas, setMas] = useState(false);
  const set = (p: Partial<TemplateItem>) => onChange((x) => ({ ...x, ...p }));
  // Ausente = encendida: las plantillas de siempre no cambian de comportamiento.
  const activa = it.enabled !== false;
  const setOpcion = (
    i: number,
    p: Partial<NonNullable<TemplateItem["options"]>[number]>,
  ) =>
    set({ options: it.options!.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const escala = it.scale || { min: 0, max: 10 };
  const condicion = it.showIf
    ? it.showIf.isFail !== undefined
      ? it.showIf.isFail
        ? "fail"
        : "pass"
      : "equals"
    : "fail";

  return (
    <div
      className="glass-sunken p-3"
      // Apagada se lee apagada, pero SIGUE siendo editable: se apaga para
      // dejar de preguntarla, no para congelarla.
      style={activa ? undefined : { opacity: 0.62 }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[1fr_11rem]">
        <Input
          aria-label={t("ui.InspectionTemplates.pregunta", "Pregunta")}
          maxLength={200}
          placeholder={t("ui.InspectionTemplates.pregunta", "Pregunta")}
          value={it.label}
          onChange={(e) => set({ label: e.target.value })}
        />
        <Select
          value={it.type}
          onValueChange={(v) =>
            set({
              type: v as ItemType,
              scale: ESCALABLES.has(v)
                ? it.scale || {
                    min: v === "rating" ? 1 : 0,
                    max: v === "rating" ? 5 : 10,
                  }
                : undefined,
              options: CON_OPCIONES.has(v)
                ? it.options || [
                    { value: "a", label: "Opción A", score: 1 },
                    { value: "b", label: "Opción B", score: 0 },
                  ]
                : undefined,
            })
          }
        >
          <SelectTrigger
            aria-label={t("ui.InspectionTemplates.tipo", "Tipo de respuesta")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((tp) => (
              <SelectItem key={tp.value} value={tp.value}>
                {tp.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* ── SE PREGUNTA / NO SE PREGUNTA ──────────────────────────────
            Apagar NO es borrar, y por eso es un interruptor y no la papelera:
            la pregunta se queda con su texto, su peso y sus condiciones, lista
            para volver. Una empresa que deja de pedir algo una temporada no
            quiere reescribirlo dentro de tres meses. */}
        <div className="flex items-center gap-2">
          <Switch
            aria-label={t("ui.InspectionTemplates.sePregunta", "Se pregunta")}
            checked={activa}
            id={`${uid}-on`}
            onCheckedChange={(v) => set({ enabled: v })}
          />
          <Label className="text-sm font-normal" htmlFor={`${uid}-on`}>
            {activa
              ? t("ui.InspectionTemplates.sePregunta", "Se pregunta")
              : t("ui.InspectionTemplates.noSePregunta", "No se pregunta")}
          </Label>
        </div>
        <Casilla
          checked={it.required !== false}
          disabled={!activa}
          id={`${uid}-req`}
          onChange={(v) => set({ required: v })}
        >
          {t("ui.InspectionTemplates.obligatorio", "Obligatoria")}
        </Casilla>
        <Casilla
          checked={it.clientVisible !== false}
          disabled={!activa}
          id={`${uid}-cli`}
          onChange={(v) => set({ clientVisible: v })}
        >
          {t("ui.InspectionTemplates.cliente", "Visible al cliente")}
        </Casilla>
        <div className="ml-auto flex items-center gap-1">
          <Button
            aria-expanded={mas}
            size="sm"
            variant={mas ? "brand" : "ghost"}
            onClick={() => setMas((m) => !m)}
          >
            <SlidersHorizontal className="size-3.5" />
            {t("ui.InspectionTemplates.ajustes", "Ajustes")}
          </Button>
          <Button
            aria-label={t("ui.InspectionTemplates.subir", "Subir")}
            disabled={first}
            size="icon-sm"
            variant="ghost"
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            aria-label={t("ui.InspectionTemplates.bajar", "Bajar")}
            disabled={last}
            size="icon-sm"
            variant="ghost"
            onClick={() => onMove(1)}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            aria-label={t("ui.InspectionTemplates.quitar", "Quitar pregunta")}
            size="icon-sm"
            variant="danger-ghost"
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {mas && (
        <div
          className="mt-3 space-y-4 border-t pt-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              hint={t(
                "ui.InspectionTemplates.ayudaHint",
                "Se muestra bajo la pregunta en la app.",
              )}
              htmlFor={`${uid}-ayuda`}
              label={t("ui.InspectionTemplates.ayuda", "Texto de ayuda")}
            >
              <Input
                id={`${uid}-ayuda`}
                maxLength={400}
                value={it.help || ""}
                onChange={(e) => set({ help: e.target.value })}
              />
            </FormField>
            <FormField
              hint={t(
                "ui.InspectionTemplates.pesoHint",
                "Cuánto cuenta esta pregunta en el porcentaje de la inspección.",
              )}
              htmlFor={`${uid}-peso`}
              label={t("ui.InspectionTemplates.peso", "Peso en la nota")}
            >
              <Input
                className="w-24 text-right"
                id={`${uid}-peso`}
                max={10}
                min={0}
                step={0.5}
                type="number"
                value={it.weight ?? 1}
                onChange={(e) => set({ weight: Number(e.target.value) })}
              />
            </FormField>
          </div>

          {ESCALABLES.has(it.type) && (
            <div>
              <div className="cg-eyebrow mb-2">
                {t("ui.InspectionTemplates.escala", "Escala")}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <FormField
                  htmlFor={`${uid}-min`}
                  label={t("ui.InspectionTemplates.minimo", "Mínimo")}
                >
                  <Input
                    id={`${uid}-min`}
                    type="number"
                    value={escala.min ?? 0}
                    onChange={(e) =>
                      set({ scale: { ...escala, min: Number(e.target.value) } })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor={`${uid}-max`}
                  label={t("ui.InspectionTemplates.maximo", "Máximo")}
                >
                  <Input
                    id={`${uid}-max`}
                    type="number"
                    value={escala.max ?? 10}
                    onChange={(e) =>
                      set({ scale: { ...escala, max: Number(e.target.value) } })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor={`${uid}-minl`}
                  label={t(
                    "ui.InspectionTemplates.etiquetaMin",
                    "Etiqueta del mínimo",
                  )}
                >
                  <Input
                    id={`${uid}-minl`}
                    value={escala.minLabel || ""}
                    onChange={(e) =>
                      set({ scale: { ...escala, minLabel: e.target.value } })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor={`${uid}-maxl`}
                  label={t(
                    "ui.InspectionTemplates.etiquetaMax",
                    "Etiqueta del máximo",
                  )}
                >
                  <Input
                    id={`${uid}-maxl`}
                    value={escala.maxLabel || ""}
                    onChange={(e) =>
                      set({ scale: { ...escala, maxLabel: e.target.value } })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor={`${uid}-lt`}
                  label={t(
                    "ui.InspectionTemplates.fallaSi",
                    "Falla si es menor que",
                  )}
                >
                  <Input
                    id={`${uid}-lt`}
                    type="number"
                    value={it.failWhen?.lt ?? ""}
                    onChange={(e) =>
                      set({
                        failWhen:
                          e.target.value === ""
                            ? undefined
                            : { lt: Number(e.target.value) },
                      })
                    }
                  />
                </FormField>
              </div>
            </div>
          )}

          {CON_OPCIONES.has(it.type) && (
            <div>
              <div className="cg-eyebrow mb-2">
                {t("ui.InspectionTemplates.opciones", "Opciones")}
              </div>
              <div
                className="mb-1 hidden grid-cols-[6rem_1fr_5rem_2rem] gap-2 text-xs sm:grid"
                style={{ color: "var(--ink-faint)" }}
              >
                <span>{t("ui.InspectionTemplates.opValor", "Valor")}</span>
                <span>
                  {t("ui.InspectionTemplates.opEtiqueta", "Etiqueta")}
                </span>
                <span>
                  {t("ui.InspectionTemplates.opPuntaje", "Puntaje 0–1")}
                </span>
                <span />
              </div>
              <div className="space-y-2">
                {(it.options || []).map((o, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[6rem_1fr_5rem_2rem] items-center gap-2"
                  >
                    <Input
                      aria-label={t("ui.InspectionTemplates.opValor", "Valor")}
                      value={o.value}
                      onChange={(e) => setOpcion(i, { value: e.target.value })}
                    />
                    <Input
                      aria-label={t(
                        "ui.InspectionTemplates.opEtiqueta",
                        "Etiqueta",
                      )}
                      value={o.label}
                      onChange={(e) => setOpcion(i, { label: e.target.value })}
                    />
                    <Input
                      aria-label={t(
                        "ui.InspectionTemplates.opPuntaje",
                        "Puntaje 0–1",
                      )}
                      className="text-right"
                      max={1}
                      min={0}
                      step={0.1}
                      type="number"
                      value={o.score ?? ""}
                      onChange={(e) =>
                        setOpcion(i, {
                          score:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                    <Button
                      aria-label={t(
                        "ui.InspectionTemplates.quitarOpcion",
                        "Quitar opción",
                      )}
                      size="icon-sm"
                      variant="danger-ghost"
                      onClick={() =>
                        set({ options: it.options!.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() =>
                  set({
                    options: [
                      ...(it.options || []),
                      {
                        value: `o${(it.options?.length || 0) + 1}`,
                        label: "",
                        score: 1,
                      },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" />
                {t("ui.InspectionTemplates.agregarOpcion", "Añadir opción")}
              </Button>
            </div>
          )}

          {it.type === "photo" && (
            <FormField
              className="max-w-xs"
              htmlFor={`${uid}-fmin`}
              label={t("ui.InspectionTemplates.fotosMinItem", "Fotos mínimas")}
            >
              <Input
                className="w-24 text-right"
                id={`${uid}-fmin`}
                max={10}
                min={0}
                type="number"
                value={it.photo?.min ?? 1}
                onChange={(e) =>
                  set({
                    photo: { ...(it.photo || {}), min: Number(e.target.value) },
                  })
                }
              />
            </FormField>
          )}

          {FALLABLES.has(it.type) && (
            <div>
              <div className="cg-eyebrow mb-2">
                {t("ui.InspectionTemplates.alFallar", "Cuando falla")}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Casilla
                  checked={!!it.onFail?.requireNote}
                  id={`${uid}-fnota`}
                  onChange={(v) =>
                    set({ onFail: { ...(it.onFail || {}), requireNote: v } })
                  }
                >
                  {t("ui.InspectionTemplates.exigeNota", "Exige nota")}
                </Casilla>
                <Casilla
                  checked={!!it.onFail?.requirePhoto}
                  id={`${uid}-ffoto`}
                  onChange={(v) =>
                    set({ onFail: { ...(it.onFail || {}), requirePhoto: v } })
                  }
                >
                  {t("ui.InspectionTemplates.exigeFoto", "Exige foto")}
                </Casilla>
                <Casilla
                  checked={!!it.onFail?.offerIncident}
                  id={`${uid}-finc`}
                  onChange={(v) =>
                    set({ onFail: { ...(it.onFail || {}), offerIncident: v } })
                  }
                >
                  {t(
                    "ui.InspectionTemplates.ofreceIncidente",
                    "Ofrece crear incidente",
                  )}
                </Casilla>
                <Casilla
                  checked={!!it.onFail?.offerTask}
                  id={`${uid}-ftarea`}
                  onChange={(v) =>
                    set({ onFail: { ...(it.onFail || {}), offerTask: v } })
                  }
                >
                  {t(
                    "ui.InspectionTemplates.ofreceTarea",
                    "Ofrece crear tarea",
                  )}
                </Casilla>
                <div className="flex items-center gap-2">
                  <Label
                    className="text-sm font-normal"
                    htmlFor={`${uid}-grav`}
                  >
                    {t("ui.InspectionTemplates.gravedad", "Gravedad")}
                  </Label>
                  <Select
                    value={it.onFail?.severity || "medium"}
                    onValueChange={(v) =>
                      set({ onFail: { ...(it.onFail || {}), severity: v } })
                    }
                  >
                    <SelectTrigger className="w-32" id={`${uid}-grav`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRAVEDAD.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="cg-eyebrow mb-2">
              {t("ui.InspectionTemplates.mostrarSolo", "Mostrar sólo si")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={it.showIf?.itemId || SIEMPRE}
                onValueChange={(v) =>
                  set({
                    showIf:
                      v === SIEMPRE ? undefined : { itemId: v, isFail: true },
                  })
                }
              >
                <SelectTrigger
                  aria-label={t(
                    "ui.InspectionTemplates.preguntaCondicion",
                    "Pregunta de la que depende",
                  )}
                  className="w-60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIEMPRE}>
                    {t("ui.InspectionTemplates.siempre", "Siempre")}
                  </SelectItem>
                  {otros.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label || o.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {it.showIf && (
                <Select
                  value={condicion}
                  onValueChange={(v) =>
                    set({
                      showIf:
                        v === "fail"
                          ? { itemId: it.showIf!.itemId, isFail: true }
                          : v === "pass"
                            ? { itemId: it.showIf!.itemId, isFail: false }
                            : { itemId: it.showIf!.itemId, equals: "" },
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={t(
                      "ui.InspectionTemplates.condicion",
                      "Condición",
                    )}
                    className="w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fail">
                      {t("ui.InspectionTemplates.falla", "falla")}
                    </SelectItem>
                    <SelectItem value="pass">
                      {t("ui.InspectionTemplates.pasa", "pasa")}
                    </SelectItem>
                    <SelectItem value="equals">
                      {t("ui.InspectionTemplates.vale", "vale…")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {it.showIf && it.showIf.isFail === undefined && (
                <Input
                  aria-label={t("ui.InspectionTemplates.valor", "valor")}
                  className="w-40"
                  placeholder={t("ui.InspectionTemplates.valor", "valor")}
                  value={it.showIf.equals ?? ""}
                  onChange={(e) =>
                    set({
                      showIf: {
                        itemId: it.showIf!.itemId,
                        equals: e.target.value,
                      },
                    })
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
