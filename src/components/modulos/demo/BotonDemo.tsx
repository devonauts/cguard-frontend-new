import {
  Suspense,
  lazy,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";

import { Modal } from "@/components/kit";

/**
 * LA PÍLDORA «DEMO» DE CADA MÓDULO EN LA TIENDA (2026-10-21).
 *
 * Todos los módulos que ofrecemos tienen su demostración animada, y se abre
 * igual en todos: una píldora junto al interruptor de la tarjeta y una
 * ventana grande. Las demostraciones se cargan al abrirlas (`lazy`): la
 * tienda no paga su peso si nadie las mira.
 *
 * Un módulo nuevo en el catálogo sin demostración aquí no enseña la píldora.
 */
const DEMOS: Record<string, LazyExoticComponent<ComponentType>> = {
  vigia_pro: lazy(() => import("@/components/vigia/ComoFuncionaVigiaPro")),
  sucursales: lazy(() => import("./DemoSucursales")),
  reconocimiento_facial: lazy(() => import("./DemoReconocimientoFacial")),
  payroll_slips: lazy(() => import("./DemoRolesDePago")),
};

export function tieneDemo(clave: string): boolean {
  return clave in DEMOS;
}

export default function BotonDemo({
  clave,
  nombre,
}: {
  clave: string;
  nombre: string;
}) {
  const { t } = useTranslation();
  const [abierta, setAbierta] = useState(false);
  const Demo = DEMOS[clave];

  if (!Demo) return null;

  return (
    <>
      <button
        aria-label={t(
          "modulosAdicionales.mensual.verComoFunciona",
          "Ver cómo funciona",
        )}
        className="cg-focus inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-200 hover:bg-[var(--brand-wash)]"
        style={{
          borderColor: "var(--hairline)",
          color: "var(--brand-text, var(--brand))",
        }}
        title={t(
          "modulosAdicionales.mensual.verComoFunciona",
          "Ver cómo funciona",
        )}
        type="button"
        onClick={() => setAbierta(true)}
      >
        <Play className="h-3 w-3" />
        {t("modulosAdicionales.mensual.demo", "Demo")}
      </button>
      <Modal
        icon={<Play />}
        open={abierta}
        size="xl"
        title={t("modulosAdicionales.demo.titulo", { nombre })}
        onOpenChange={setAbierta}
      >
        {abierta && (
          <Suspense
            fallback={
              <div
                className="h-[600px] animate-pulse rounded-2xl"
                style={{ background: "var(--glass-sunken)" }}
              />
            }
          >
            <Demo />
          </Suspense>
        )}
      </Modal>
    </>
  );
}
