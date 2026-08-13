"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Bold, Italic, Underline, Quote, List, ListOrdered, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command";
import { Modal, StatusBadge } from "@/components/kit";
import { FileText } from "lucide-react";
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: PolicyForm) => void;
  onDraft: (data: PolicyForm) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dept, setDept] = useState<string | undefined>();
  const [guards, setGuards] = useState<string[]>([]);

  /* Vigilantes y departamentos REALES. Antes eran dos listas inventadas en este
     archivo («Juan Pérez», «Operaciones»): la política se asignaba a gente que
     no existe, así que el diálogo no podía funcionar aunque se guardara. Los dos
     endpoints ya existían. */
  const [listaVigilantes, setListaVigilantes] = useState<Guard[]>([]);
  const [listaDepartamentos, setListaDepartamentos] = useState<Department[]>([]);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    (async () => {
      try {
        const r: any = await securityGuardService.list({ limit: 500 });
        const filas = Array.isArray(r) ? r : r?.rows || [];
        if (vivo) setListaVigilantes(filas.map((g: any) => ({
          id: String(g.id),
          name: g.fullName || [g.firstName, g.lastName].filter(Boolean).join(' ') || g.name || 'Sin nombre',
        })));
      } catch { if (vivo) setListaVigilantes([]); }
      try {
        const { rows } = await departmentService.list();
        if (vivo) setListaDepartamentos((rows || []).map((d: any) => ({ id: String(d.id), name: d.name })));
      } catch { if (vivo) setListaDepartamentos([]); }
    })();
    return () => { vivo = false; };
  }, [open]);

  const selectedGuards = useMemo(() => listaVigilantes.filter((g) => guards.includes(g.id)), [guards, listaVigilantes]);

  const reset = () => {
    setTitle("");
    setContent("");
    setDept(undefined);
    setGuards([]);
  };

  const payload: PolicyForm = { title, content, departmentId: dept, guards };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      size="lg"
      icon={<FileText />}
      title="Agregar Política de Empresa"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" /> Cerrar
          </Button>
          <Button type="button" variant="outline" onClick={() => onDraft(payload)}>
            Guardar como borrador
          </Button>
          <Button onClick={() => onSubmit(payload)} disabled={!title.trim()} variant="brand" className="px-8">
            Guardar
          </Button>
        </>
      }
    >
        <div className="space-y-5">
          <Input placeholder="Título*" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
            <div
              className="flex items-center gap-1 border-b p-2"
              style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
            >
              <Button size="sm" type="button" variant="ghost"><Bold className="h-4 w-4" /></Button>
              <Button size="sm" type="button" variant="ghost"><Italic className="h-4 w-4" /></Button>
              <Button size="sm" type="button" variant="ghost"><Underline className="h-4 w-4" /></Button>
              <Button size="sm" type="button" variant="ghost"><Quote className="h-4 w-4" /></Button>
              <Button size="sm" type="button" variant="ghost"><List className="h-4 w-4" /></Button>
              <Button size="sm" type="button" variant="ghost"><ListOrdered className="h-4 w-4" /></Button>
              <Button size="sm" type="button" variant="ghost"><Type className="h-4 w-4" /></Button>
            </div>
            <Textarea
              className="min-h-[220px] border-0 bg-transparent focus-visible:ring-0"
              placeholder="Escribir aquí"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Departamento</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Departamento" />
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
              <Label className="mb-1 block">Seleccionar Vigilantes Específicos</Label>
              <GuardMultiSelect value={guards} onChange={setGuards} options={listaVigilantes} />
              {selectedGuards.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedGuards.map((g) => (
                    <StatusBadge key={g.id} tone="neutral" dot={false}>
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
  const [open, setOpen] = useState(false);
  const picked = options.filter((g) => value.includes(g.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          {picked.length ? (
            <span className="truncate">{picked.map((g) => g.name).join(", ")}</span>
          ) : (
            <span style={{ color: "var(--ink-faint)" }}>Seleccionar vigilantes…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[360px]">
        <Command>
          <CommandInput placeholder="Buscar vigilante…" />
          <CommandList>
            <CommandGroup>
              {options.map((g) => {
                const isChecked = value.includes(g.id);
                return (
                  <CommandItem
                    key={g.id}
                    onSelect={() => {
                      if (isChecked) onChange(value.filter((id) => id !== g.id));
                      else onChange([...value, g.id]);
                    }}
                  >
                    <Checkbox className="mr-2" checked={isChecked} />
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
