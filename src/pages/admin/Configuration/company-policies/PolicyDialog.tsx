"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Bold,
  Italic,
  Underline,
  Quote,
  List,
  ListOrdered,
  Type,
} from "lucide-react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Modal, StatusBadge } from "@/components/kit";
import securityGuardService from "@/lib/api/securityGuardService";
import departmentService from "@/lib/api/departmentService";

type Guard = { id: string; name: string };
type Department = { id: string; name: string };

export type PolicyForm = {
  title: string;
  content: string;
  departmentId?: string;
  guards: string[];
};

export default function PolicyDialog({
  open,
  onOpenChange,
  onSubmit,
  onDraft,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: PolicyForm) => void;
  onDraft: (data: PolicyForm) => void;
  /** An existing document to edit; without it the dialog creates a new one. */
  initial?: Partial<PolicyForm> | null;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dept, setDept] = useState<string | undefined>();
  const [guards, setGuards] = useState<string[]>([]);

  // Each opening starts from the document being edited (or empty).
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setContent(initial?.content ?? "");
    setDept(initial?.departmentId || undefined);
    setGuards(initial?.guards ?? []);
  }, [open, initial]);

  /* Vigilantes y departamentos REALES. Antes eran dos listas inventadas en este
     archivo («Juan Pérez», «Operaciones»): la política se asignaba a gente que
     no existe, así que el diálogo no podía funcionar aunque se guardara. Los dos
     endpoints ya existían. */
  const [listaVigilantes, setListaVigilantes] = useState<Guard[]>([]);
  const [listaDepartamentos, setListaDepartamentos] = useState<Department[]>(
    [],
  );

  useEffect(() => {
    if (!open) return;
    let vivo = true;

    (async () => {
      try {
        const r: any = await securityGuardService.list({ limit: 500 });
        const filas = Array.isArray(r) ? r : r?.rows || [];

        if (vivo)
          setListaVigilantes(
            filas.map((g: any) => ({
              id: String(g.id),
              name:
                g.fullName ||
                [g.firstName, g.lastName].filter(Boolean).join(" ") ||
                g.name ||
                t("settings.companyPolicies.guardNoNameFallback", {
                  defaultValue: "Sin nombre",
                }),
            })),
          );
      } catch {
        if (vivo) setListaVigilantes([]);
      }
      try {
        const { rows } = await departmentService.list();

        if (vivo)
          setListaDepartamentos(
            (rows || []).map((d: any) => ({ id: String(d.id), name: d.name })),
          );
      } catch {
        if (vivo) setListaDepartamentos([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [open]);

  const selectedGuards = useMemo(
    () => listaVigilantes.filter((g) => guards.includes(g.id)),
    [guards, listaVigilantes],
  );

  const reset = () => {
    setTitle("");
    setContent("");
    setDept(undefined);
    setGuards([]);
  };

  const payload: PolicyForm = { title, content, departmentId: dept, guards };

  return (
    <Modal
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />{" "}
            {t("settings.companyPolicies.closeBtn", { defaultValue: "Cerrar" })}
          </Button>
          <Button
            disabled={!title.trim()}
            type="button"
            variant="outline"
            onClick={() => onDraft(payload)}
          >
            {t("settings.companyPolicies.saveDraftBtn", {
              defaultValue: "Guardar como borrador",
            })}
          </Button>
          <Button
            className="px-8"
            disabled={!title.trim()}
            variant="brand"
            onClick={() => onSubmit(payload)}
          >
            {t("settings.companyPolicies.saveBtn", { defaultValue: "Guardar" })}
          </Button>
        </>
      }
      icon={<FileText />}
      open={open}
      size="lg"
      title={
        initial
          ? t("settings.companyPolicies.editDialogTitle", {
              defaultValue: "Editar documento",
            })
          : t("settings.companyPolicies.dialogTitle", {
              defaultValue: "Agregar Política de Empresa",
            })
      }
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <div className="space-y-5">
        <Input
          placeholder={t("settings.companyPolicies.titlePlaceholder", {
            defaultValue: "Título*",
          })}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div
          className="rounded-xl border"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div
            className="flex flex-wrap items-center gap-1 border-b p-2"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--glass-sunken)",
              color: "var(--ink-soft)",
            }}
          >
            <Button size="sm" type="button" variant="ghost">
              <Bold className="h-4 w-4" />
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <Italic className="h-4 w-4" />
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <Underline className="h-4 w-4" />
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <Quote className="h-4 w-4" />
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <List className="h-4 w-4" />
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <ListOrdered className="h-4 w-4" />
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <Type className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            className="min-h-[220px] border-0 bg-transparent focus-visible:ring-0"
            placeholder={t("settings.companyPolicies.contentPlaceholder", {
              defaultValue: "Escribir aquí",
            })}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block">
              {t("settings.companyPolicies.departmentLabel", {
                defaultValue: "Departamento",
              })}
            </Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t(
                    "settings.companyPolicies.departmentPlaceholder",
                    { defaultValue: "Departamento" },
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {listaDepartamentos.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block">
              {t("settings.companyPolicies.selectGuardsLabel", {
                defaultValue: "Seleccionar Vigilantes Específicos",
              })}
            </Label>
            <GuardMultiSelect
              options={listaVigilantes}
              value={guards}
              onChange={setGuards}
            />
            {selectedGuards.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedGuards.map((g) => (
                  <StatusBadge key={g.id} dot={false} tone="neutral">
                    {g.name}
                  </StatusBadge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* Las opciones llegan por prop: este selector vive fuera del componente que las
   carga, y antes leía la lista inventada que había en el módulo. */
function GuardMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: Guard[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const picked = options.filter((g) => value.includes(g.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="w-full justify-start" variant="outline">
          {picked.length ? (
            <span className="truncate">
              {picked.map((g) => g.name).join(", ")}
            </span>
          ) : (
            <span style={{ color: "var(--ink-faint)" }}>
              {t("settings.companyPolicies.selectGuardsPlaceholder", {
                defaultValue: "Seleccionar vigilantes…",
              })}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput
            placeholder={t("settings.companyPolicies.searchGuardPlaceholder", {
              defaultValue: "Buscar vigilante…",
            })}
          />
          <CommandList>
            <CommandGroup>
              {options.map((g) => {
                const isChecked = value.includes(g.id);

                return (
                  <CommandItem
                    key={g.id}
                    onSelect={() => {
                      if (isChecked)
                        onChange(value.filter((id) => id !== g.id));
                      else onChange([...value, g.id]);
                    }}
                  >
                    <Checkbox checked={isChecked} className="mr-2" />
                    {g.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
