/**
 * Compact per-guard review "level" badge — a star + average + count. Shown on
 * every worker-detail surface (Personal asignado, guard cards/list, guard hero)
 * so a bad service pattern is visible at a glance. Clickable → the guard's
 * Perfil › Reseñas. Renders nothing when the guard has no reviews (count 0),
 * unless `showEmpty` is set (then a muted "Sin reseñas").
 *
 * ── POR QUÉ VA SOBRE `StatusBadge` ─────────────────────────────────────────
 * Esta píldora se pinta SIEMPRE al lado de otra: en `GuardCardsGrid` y en la
 * lista de vigilantes comparte fila con la píldora de estado. Cuando tenía sus
 * propias medidas (`px-2 py-0.5` frente a `px-2.5 py-1` del kit) las dos salían
 * a alturas distintas en la misma línea. El tono sigue siendo semántico fijo
 * —bueno/regular/malo— porque una nota baja tiene que leerse roja aunque el
 * usuario elija rojo como acento.
 */
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/kit';

/** Nota → papel del sistema: bueno / regular / malo. */
const toneFor = (avg: number) => (avg >= 4 ? 'ok' : avg >= 3 ? 'warn' : 'bad');

export default function GuardRatingLevel({
  average,
  count,
  onClick,
  showEmpty = false,
  className = '',
}: {
  average?: number | null;
  count?: number | null;
  onClick?: () => void;
  showEmpty?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const has = typeof average === 'number' && (count ?? 0) > 0;
  if (!has) {
    if (!showEmpty) return null;
    return (
      <StatusBadge tone="neutral" dot={false} className={className}>
        <Star className="h-3 w-3" /> Sin reseñas
      </StatusBadge>
    );
  }
  const avg = average as number;
  const inner = (
    <>
      <Star className="h-3 w-3 fill-current" />
      <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>
      <span className="tabular-nums opacity-70">({count})</span>
    </>
  );
  const tone = toneFor(avg);

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="cg-focus rounded-full transition hover:brightness-95"
        title={t("ui.GuardRatingLevel.verResenasDelVigilante", "Ver reseñas del vigilante")}
      >
        <StatusBadge tone={tone} dot={false} className={className}>{inner}</StatusBadge>
      </button>
    );
  }
  return (
    <StatusBadge tone={tone} dot={false} className={className}>
      <span title={`${avg.toFixed(2)} de 5 · ${count} reseña(s)`} className="inline-flex items-center gap-1">{inner}</span>
    </StatusBadge>
  );
}
