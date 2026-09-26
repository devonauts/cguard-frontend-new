import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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

/**
 * Selector múltiple de SEDES (y de clientes, que comparten forma).
 *
 * Vivía dentro de `EditAdminUserPage` y estaba COPIADO en `NewAdminUserPage`.
 * Se saca aquí porque lo necesita un tercer sitio —la ficha del supervisor—, y
 * tres copias de un control con lógica de «seleccionar todos» es como se acaba
 * con tres comportamientos distintos para el mismo control.
 *
 * Sin cambios de comportamiento respecto del original.
 */
export function MultiSelectDeSedes({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: Array<{ id: string; name: string }>;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const picked = options.filter((o) => value.includes(o.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="w-full justify-start" variant="outline">
          {picked.length ? (
            <span className="truncate">
              {picked.map((p) => p.name).join(", ")}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {placeholder ||
                t("adminOfficeUsers.editUser.form.selectDefault", {
                  defaultValue: "Seleccionar…",
                })}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[calc(100vw-2rem)] sm:w-[360px]">
        <div className="p-2">
          <Command>
            <CommandInput
              placeholder={t("ui.MultiSelectDeSedes.buscar", {
                defaultValue: "Buscar {{que}}…",
                que:
                  placeholder ||
                  t("adminOfficeUsers.editUser.form.searchPlaceholder", {
                    defaultValue: "opción",
                  }),
              })}
            />
            <CommandList>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    const allSelected =
                      options.length > 0 &&
                      value.length === options.length &&
                      options.every((o) => value.includes(o.id));

                    if (allSelected) onChange([]);
                    else onChange(options.map((o) => o.id));
                  }}
                >
                  {(() => {
                    const allSelected =
                      options.length > 0 &&
                      value.length === options.length &&
                      options.every((o) => value.includes(o.id));

                    return (
                      <>
                        <input
                          readOnly
                          checked={allSelected}
                          className="mr-2"
                          type="checkbox"
                        />
                        {allSelected
                          ? t("adminOfficeUsers.editUser.form.deselectAll", {
                              defaultValue: "Deseleccionar todos",
                            })
                          : t("adminOfficeUsers.editUser.form.selectAll", {
                              defaultValue: "Seleccionar todos",
                            })}
                      </>
                    );
                  })()}
                </CommandItem>

                {options.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    {t("adminOfficeUsers.editUser.form.noOptions", {
                      defaultValue: "Sin opciones",
                    })}
                  </div>
                )}

                {options.map((opt) => {
                  const checked = value.includes(opt.id);

                  return (
                    <CommandItem
                      key={opt.id}
                      onSelect={() => {
                        if (checked)
                          onChange(value.filter((id) => id !== opt.id));
                        else onChange([...value, opt.id]);
                      }}
                    >
                      <input
                        readOnly
                        checked={checked}
                        className="mr-2"
                        type="checkbox"
                      />
                      {opt.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
