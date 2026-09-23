/**
 * Filtro por puesto de la página de Pases de turno.
 *
 * Busca en el servidor mientras se escribe, en vez de cargar una lista fija:
 * el autocompletado devuelve como mucho 50 puestos, y una empresa con más
 * no podría elegir el 51. Busca también por nominativo («BRAVO 5»), que es
 * como se nombra un puesto en la operación.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import taskService from "@/lib/api/taskService";

export type PuestoElegido = { id: string; label: string };

type Opcion = PuestoElegido;

export default function FiltroDePuesto({
  value,
  onChange,
}: {
  value: PuestoElegido | null;
  onChange: (v: PuestoElegido | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [cargando, setCargando] = useState(false);

  // Sólo se busca con el desplegable abierto; con una pausa corta para no
  // lanzar una petición por tecla.
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    const h = setTimeout(() => {
      setCargando(true);
      taskService
        .stations(query.trim())
        .then((r: any) => {
          if (!vivo) return;
          const rows = (r?.rows || r || []) as Array<{
            id: string;
            label?: string;
            stationName?: string;
            nickname?: string | null;
          }>;

          setOpciones(
            rows.map((s) => {
              const nombre = s.label || s.stationName || s.id;

              return {
                id: s.id,
                label:
                  s.nickname && s.nickname !== nombre
                    ? `${nombre} · ${s.nickname}`
                    : nombre,
              };
            }),
          );
        })
        .catch(() => vivo && setOpciones([]))
        .finally(() => vivo && setCargando(false));
    }, 250);

    return () => {
      vivo = false;
      clearTimeout(h);
    };
  }, [open, query]);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className="w-full min-w-0 justify-between sm:w-64"
            type="button"
            variant="outline"
          >
            <span
              className="truncate"
              style={value ? undefined : { color: "var(--ink-faint)" }}
            >
              {value
                ? value.label
                : t("passdown.filter.allStations", "Todos los puestos")}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("passdown.filter.search", "Buscar puesto…")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {cargando
                  ? t("passdown.filter.searching", "Buscando…")
                  : t("passdown.filter.noResults", "Ningún puesto coincide")}
              </CommandEmpty>
              <CommandGroup>
                {opciones.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => {
                      onChange(o);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className="mr-2 size-4"
                      style={{ opacity: value?.id === o.id ? 1 : 0 }}
                    />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          aria-label={t("passdown.filter.clear", "Quitar el filtro de puesto")}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => onChange(null)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
