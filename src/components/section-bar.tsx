import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";

type Props = {
  title: string;
  right?: ReactNode;
  onHamburger?: () => void;
  className?: string;
};

export default function SectionBar({
  title,
  right,
  onHamburger,
  className,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className={["sticky top-0 z-10 bg-card", className ?? ""].join(" ")}>
      <div className="h-12 flex items-center justify-between border-b border-border px-4">
        <div className="text-[15px] text-muted-foreground truncate">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {right}
          <button
            aria-label={t(
              "ui.sectionbar.mostrarOcultarMenu",
              "Mostrar/Ocultar menú",
            )}
            className="p-2 rounded hover:bg-muted text-foreground/70"
            onClick={onHamburger}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
