import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import CampoDeMarca from "./CampoDeMarca";

import { useMarcas } from "@/hooks/useMarcas";
import {
  fijarMarcaDeRegistro,
  marcasService,
} from "@/lib/api/marcasService";

/**
 * «EMPRESA EN LA QUE SE REGISTRÓ» on a person's edit screen (Multimarca).
 *
 * Payroll is not shared: each person is paid by the brand they were
 * registered in (`tenantUsers.homeBrandId`), even for hours worked at another
 * brand's sites. The current value comes from `GET /brands/people`; the edit
 * screen calls `guardar()` after its own save, and only a CHANGE is written
 * (`PATCH /user/:id { homeBrandId }`, audited by the server).
 */
export function useMarcaDeRegistro(userId: string | null | undefined) {
  const { activo } = useMarcas();
  const qc = useQueryClient();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const personas = useQuery({
    queryKey: ["marcas", "personas", tenant],
    queryFn: () => marcasService.personas(),
    enabled: activo && !!tenant && !!userId,
    staleTime: 60_000,
    retry: false,
  });
  const inicial = userId ? (personas.data?.[String(userId)] ?? "") : "";
  const [valor, setValor] = useState("");
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!tocado) setValor(inicial || "");
  }, [inicial, tocado]);

  const guardar = async () => {
    if (!activo || !userId || !tocado || !valor || valor === inicial) return;
    await fijarMarcaDeRegistro(String(userId), valor);
    await qc.invalidateQueries({ queryKey: ["marcas"] });
  };

  return {
    activo,
    valor,
    setValor: (v: string) => {
      setTocado(true);
      setValor(v);
    },
    /** Loaded (or nothing to load): the select may show its value. */
    listo: !activo || !userId || personas.isFetched,
    guardar,
  };
}

/** The select itself, for an edit screen that holds `useMarcaDeRegistro`. */
export default function CampoMarcaDeRegistro({
  estado,
  className,
  labelClassName,
  selectClassName,
}: {
  estado: ReturnType<typeof useMarcaDeRegistro>;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
}) {
  const { t } = useTranslation();

  if (!estado.activo || !estado.listo) return null;

  return (
    <CampoDeMarca
      autoDefault={false}
      className={className}
      hint={t(
        "ui.CampoMarcaDeRegistro.ayuda",
        "Define en qué planilla de roles de pago cobra esta persona",
      )}
      id="persona-marca"
      label={t(
        "ui.CampoMarcaDeRegistro.etiqueta",
        "Empresa en la que se registró",
      )}
      labelClassName={labelClassName}
      selectClassName={selectClassName}
      value={estado.valor}
      onChange={estado.setValor}
    />
  );
}
