/**
 * AJUSTES — everything the company decides about its dobletes: waves, money,
 * points, levels, ranking, and how it works with VigIA Pro.
 *
 * What the platform does NOT decide: hour or rest limits. Hours are shown as
 * information and the company chooses; the only hard block is being at two
 * posts at the same time.
 *
 * Points live in the existing performance settings (volunteerPoints /
 * coverPoints / bonusCap, defaults 1 / 4 / 12); this screen is the first one
 * that writes them, through the same endpoint the performance score reads.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Banknote, Bot, Medal, Radio, Star, Trophy } from "lucide-react";

import { MoneyInput, usePuedeGestionarDobletes } from "./comun";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoNote, Section, SkeletonCards } from "@/components/kit";
import {
  NumberRow,
  SaveBar,
  SettingRow,
  ToggleRow,
} from "@/pages/admin/Configuration/components/SettingsForm";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePermissions } from "@/hooks/usePermissions";
import { useAgente } from "@/lib/agenteDeMarca";
import dobletesService, {
  DEFAULT_POINTS,
  type DobletesSettings,
  type PointsSettings,
} from "@/lib/api/dobletesService";

const MONEY_CLS = "cg-input w-28 px-3 py-2 text-right text-sm";

export default function TabAjustes() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const agente = useAgente();
  const a = { agente: agente.nombre };
  const puede = usePuedeGestionarDobletes();
  const { hasPermission } = usePermissions();
  const puedePuntos = hasPermission("securityGuardEdit");
  const conVigia = useEntitlement("vigia_pro");
  const conRoles = useEntitlement("payroll_slips");

  const ajustes = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
  });
  const puntos = useQuery({
    queryKey: ["dobletes", "points"],
    queryFn: () => dobletesService.points(),
  });

  const [b, setB] = useState<DobletesSettings | null>(null);
  const [p, setP] = useState<PointsSettings | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (ajustes.data && !b) setB(ajustes.data.settings);
  }, [ajustes.data, b]);
  useEffect(() => {
    if (puntos.data && !p) setP(puntos.data);
  }, [puntos.data, p]);

  const cambiosAjustes = useMemo(
    () =>
      !!b &&
      !!ajustes.data &&
      JSON.stringify(b) !== JSON.stringify(ajustes.data.settings),
    [b, ajustes.data],
  );
  const cambiosPuntos = useMemo(
    () =>
      !!p && !!puntos.data && JSON.stringify(p) !== JSON.stringify(puntos.data),
    [p, puntos.data],
  );

  if (ajustes.isLoading || !b) return <SkeletonCards count={4} />;

  const moneda = ajustes.data?.currency || "USD";
  const decimales = ajustes.data?.decimals ?? 2;
  const cambiar = (x: Partial<DobletesSettings>) =>
    setB((v) => (v ? { ...v, ...x } : v));
  const ola = (i: number, n: number | null) =>
    setB((v) => {
      if (!v) return v;
      const olas = [...v.waveSizes];

      olas[i] = Math.max(1, Math.min(50, n ?? 1));

      return { ...v, waveSizes: olas };
    });

  const guardar = async () => {
    setGuardando(true);
    try {
      if (cambiosAjustes && b) {
        const r = await dobletesService.saveSettings(b);

        setB(r.settings);
      }
      if (cambiosPuntos && p) {
        const r = await dobletesService.savePoints(p);

        setP(r);
      }
      toast.success(t("dobletes.ajustes.guardados", "Ajustes guardados"));
      void qc.invalidateQueries({ queryKey: ["dobletes", "settings"] });
      void qc.invalidateQueries({ queryKey: ["dobletes", "points"] });
    } catch {
      /* shown by the API layer */
    } finally {
      setGuardando(false);
    }
  };

  const Dinero = ({
    cents,
    onCents,
  }: {
    cents: number | null;
    onCents: (c: number | null) => void;
  }) => (
    <div className="flex items-center gap-2">
      <MoneyInput
        cents={cents}
        className={MONEY_CLS}
        decimals={decimales}
        disabled={!puede}
        placeholder="0"
        onCents={onCents}
      />
      <span className="w-10 text-xs" style={{ color: "var(--ink-faint)" }}>
        {moneda}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <InfoNote tone="info">
        {t(
          "dobletes.ajustes.sinLimites",
          "La plataforma no pone límites de horas ni de descanso: lo decide tu empresa. Al ofrecer, verás las horas de cada persona en la semana sólo como información.",
        )}
      </InfoNote>

      <Section
        contentClassName="divide-y"
        icon={<Radio />}
        title={t("dobletes.ajustes.oleadas", "Cómo se ofrece")}
      >
        <p className="pb-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "dobletes.ajustes.oleadasDesc",
            "Primero a la reserva disponible para ese horario, mejor clasificados primero (Oro antes). El primero que acepta se queda el turno.",
          )}
        </p>
        <NumberRow
          disabled={!puede}
          label={t("dobletes.ajustes.ola1", "Primera oleada")}
          max={50}
          min={1}
          suffix={t("dobletes.ajustes.personas", "personas")}
          value={b.waveSizes[0] ?? 3}
          onChange={(n) => ola(0, n)}
        />
        <NumberRow
          disabled={!puede}
          label={t("dobletes.ajustes.ola2", "Siguiente oleada")}
          max={50}
          min={1}
          suffix={t("dobletes.ajustes.personas", "personas")}
          value={b.waveSizes[1] ?? 5}
          onChange={(n) => ola(1, n)}
        />
        <NumberRow
          disabled={!puede}
          hint={t(
            "dobletes.ajustes.minutosHint",
            "Si nadie acepta en este tiempo, sale la siguiente oleada. Cuando se acaban, te avisamos.",
          )}
          label={t("dobletes.ajustes.minutos", "Espera entre oleadas")}
          max={120}
          min={3}
          suffix={t("dobletes.ajustes.min", "min")}
          value={b.waveMinutes}
          onChange={(n) => cambiar({ waveMinutes: n ?? 15 })}
        />
      </Section>

      <Section
        contentClassName="divide-y"
        icon={<Banknote />}
        title={t("dobletes.ajustes.bonos", "Bonos")}
      >
        <SettingRow
          control={
            <Dinero
              cents={b.defaultBonusCents}
              onCents={(c) => cambiar({ defaultBonusCents: c })}
            />
          }
          hint={t(
            "dobletes.ajustes.bonoHint",
            "Lo que se ofrece por cada doblete. Se puede subir en cada oferta. Vacío = sin bono.",
          )}
          label={t("dobletes.ajustes.bono", "Bono por doblete")}
        />
        <SettingRow
          control={
            <Dinero
              cents={b.urgentBonusCents}
              onCents={(c) => cambiar({ urgentBonusCents: c })}
            />
          }
          hint={t(
            "dobletes.ajustes.relampagoHint",
            "Para las ofertas marcadas como urgentes.",
          )}
          label={t("dobletes.ajustes.relampago", "Bono relámpago")}
        />
        <SettingRow
          control={
            <Dinero
              cents={b.earlyBonusCents}
              onCents={(c) => cambiar({ earlyBonusCents: c })}
            />
          }
          hint={t("dobletes.ajustes.tempranoHint", {
            defaultValue:
              "Extra para quien acepta en los primeros {{n}} minutos.",
            n: b.earlyMinutes,
          })}
          label={t("dobletes.ajustes.temprano", "Extra por aceptar rápido")}
        >
          {!!b.earlyBonusCents && (
            <div className="mt-2 max-w-sm">
              <NumberRow
                disabled={!puede}
                label={t(
                  "dobletes.ajustes.tempranoMinutos",
                  "Cuenta como rápido hasta",
                )}
                max={60}
                min={1}
                suffix={t("dobletes.ajustes.min", "min")}
                value={b.earlyMinutes}
                onChange={(n) => cambiar({ earlyMinutes: n ?? 5 })}
              />
            </div>
          )}
        </SettingRow>
        <div className="pt-4">
          {conRoles ? (
            <InfoNote tone="ok">
              {t(
                "dobletes.ajustes.rolesActivo",
                "Cada bono pagado llega a Roles de pago como «Bono por doblete» en el periodo del turno.",
              )}{" "}
              <Link
                className="font-semibold underline"
                to="/nomina/roles/conceptos"
              >
                {t("dobletes.ajustes.verConcepto", "Ver el concepto")}
              </Link>
            </InfoNote>
          ) : (
            <InfoNote tone="neutral">
              {t(
                "dobletes.ajustes.rolesInactivo",
                "Con el módulo Roles de pago, los bonos se suman solos al rol de cada vigilante como «Bono por doblete». Sin él, los ves en el historial de ofertas.",
              )}
            </InfoNote>
          )}
        </div>
      </Section>

      <Section
        contentClassName="divide-y"
        icon={<Star />}
        title={t("dobletes.ajustes.puntos", "Puntos de respaldo")}
      >
        <p className="pb-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "dobletes.ajustes.puntosDesc",
            "Se suman a la nota de desempeño de cada vigilante. Decir que no a una oferta nunca resta.",
          )}
        </p>
        {puntos.isLoading || !p ? (
          <SkeletonCards count={1} />
        ) : (
          <>
            <NumberRow
              disabled={!puedePuntos}
              hint={t("dobletes.ajustes.voluntarioHint", {
                defaultValue:
                  "Por unirse o marcarse disponible. De fábrica, {{n}}.",
                n: DEFAULT_POINTS.volunteerPoints,
              })}
              label={t("dobletes.ajustes.voluntario", "Por ofrecerse")}
              max={100}
              min={0}
              value={p.volunteerPoints ?? DEFAULT_POINTS.volunteerPoints}
              onChange={(n) =>
                setP((v) => (v ? { ...v, volunteerPoints: n } : v))
              }
            />
            <NumberRow
              disabled={!puedePuntos}
              hint={t("dobletes.ajustes.cubrirHint", {
                defaultValue: "Por cada doblete cubierto. De fábrica, {{n}}.",
                n: DEFAULT_POINTS.coverPoints,
              })}
              label={t("dobletes.ajustes.cubrir", "Por cubrir")}
              max={100}
              min={0}
              value={p.coverPoints ?? DEFAULT_POINTS.coverPoints}
              onChange={(n) => setP((v) => (v ? { ...v, coverPoints: n } : v))}
            />
            <NumberRow
              disabled={!puedePuntos}
              hint={t("dobletes.ajustes.topeHint", {
                defaultValue:
                  "Máximo de puntos de respaldo que suma una persona. De fábrica, {{n}}.",
                n: DEFAULT_POINTS.bonusCap,
              })}
              label={t("dobletes.ajustes.tope", "Tope")}
              max={100}
              min={0}
              value={p.bonusCap ?? DEFAULT_POINTS.bonusCap}
              onChange={(n) => setP((v) => (v ? { ...v, bonusCap: n } : v))}
            />
            {!puedePuntos && (
              <p className="pt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "dobletes.ajustes.puntosPermiso",
                  "Cambiar los puntos pide permiso para editar vigilantes.",
                )}
              </p>
            )}
          </>
        )}
      </Section>

      <Section
        contentClassName="divide-y"
        icon={<Medal />}
        title={t("dobletes.ajustes.niveles", "Niveles del mes")}
      >
        <ToggleRow
          checked={b.levels.enabled}
          disabled={!puede}
          hint={t(
            "dobletes.ajustes.nivelesHint",
            "Bronce, Plata y Oro según los dobletes cubiertos en el mes. Oro ve las ofertas primero.",
          )}
          label={t("dobletes.ajustes.nivelesActivos", "Usar niveles")}
          onCheckedChange={(v) =>
            cambiar({ levels: { ...b.levels, enabled: v } })
          }
        >
          {b.levels.enabled && (
            <div className="mt-2 grid max-w-xl gap-x-6 sm:grid-cols-2">
              <NumberRow
                disabled={!puede}
                label={t("dobletes.nivel.plata", "Plata")}
                max={60}
                min={1}
                suffix={t("dobletes.ajustes.dobletes", "dobletes")}
                value={b.levels.rules.plata}
                onChange={(n) =>
                  cambiar({
                    levels: {
                      ...b.levels,
                      rules: { ...b.levels.rules, plata: n ?? 2 },
                    },
                  })
                }
              />
              <NumberRow
                disabled={!puede}
                label={t("dobletes.nivel.oro", "Oro")}
                max={60}
                min={1}
                suffix={t("dobletes.ajustes.dobletes", "dobletes")}
                value={b.levels.rules.oro}
                onChange={(n) =>
                  cambiar({
                    levels: {
                      ...b.levels,
                      rules: { ...b.levels.rules, oro: n ?? 5 },
                    },
                  })
                }
              />
            </div>
          )}
        </ToggleRow>
        {b.levels.enabled && b.levels.rules.oro <= b.levels.rules.plata && (
          <div className="py-3">
            <InfoNote tone="warn">
              {t(
                "dobletes.ajustes.nivelesOrden",
                "Oro debería pedir más dobletes que Plata.",
              )}
            </InfoNote>
          </div>
        )}
      </Section>

      <Section
        contentClassName="divide-y"
        icon={<Trophy />}
        title={t("dobletes.ajustes.reconocimiento", "Reconocimiento")}
      >
        <ToggleRow
          checked={b.ranking}
          disabled={!puede}
          hint={t(
            "dobletes.ajustes.rankingHint",
            "Tus vigilantes ven en la app quién más cubrió este mes.",
          )}
          label={t("dobletes.ajustes.ranking", "Ranking en la app")}
          onCheckedChange={(v) => cambiar({ ranking: v })}
        />
        <ToggleRow
          checked={b.reserveOfMonth}
          disabled={!puede}
          hint={t(
            "dobletes.ajustes.respaldoHint",
            "Destaca a quien más dobletes cubrió en el mes.",
          )}
          label={t("dobletes.ranking.respaldoDelMes", "Respaldo del mes")}
          onCheckedChange={(v) => cambiar({ reserveOfMonth: v })}
        />
      </Section>

      {conVigia && (
        <Section
          contentClassName="divide-y"
          icon={<Bot />}
          title={t("dobletes.ajustes.vigia", {
            defaultValue: "Con {{agente}} Pro",
            ...a,
          })}
        >
          <SettingRow
            control={
              <Select
                disabled={!puede}
                value={b.autoLaunchWithVigiaPro ? "ofrecer" : "avisar"}
                onValueChange={(v) =>
                  cambiar({ autoLaunchWithVigiaPro: v === "ofrecer" })
                }
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avisar">
                    {t(
                      "dobletes.ajustes.soloAvisar",
                      "Solo avisar a la oficina",
                    )}
                  </SelectItem>
                  <SelectItem value="ofrecer">
                    {t(
                      "dobletes.ajustes.ofrecerAuto",
                      "Ofrecer el doblete automáticamente",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            }
            hint={
              b.autoLaunchWithVigiaPro
                ? t("dobletes.ajustes.autoHintSi", {
                    defaultValue:
                      "Cuando {{agente}} confirma una falta, lanza la búsqueda por oleadas con el bono de la empresa y te cuenta quién lo cubrió.",
                    ...a,
                  })
                : t("dobletes.ajustes.autoHintNo", {
                    defaultValue:
                      "{{agente}} te avisa de la falta y tú decides si ofreces el doblete.",
                    ...a,
                  })
            }
            label={t("dobletes.ajustes.cuandoFalte", "Cuando falte alguien")}
          />
          <ToggleRow
            checked={b.voiceAsLastChannel}
            disabled={!puede}
            hint={t("dobletes.ajustes.vozHint", {
              defaultValue:
                "Si después de todas las oleadas nadie aceptó, {{agente}} llama a los siguientes de la lista y aceptan marcando 1. Se cobra por minuto del saldo de comunicaciones.",
              ...a,
            })}
            label={t("dobletes.ajustes.voz", "Llamada como último recurso")}
            onCheckedChange={(v) => cambiar({ voiceAsLastChannel: v })}
          />
        </Section>
      )}

      {(puede || puedePuntos) && (
        <SaveBar
          disabled={!cambiosAjustes && !cambiosPuntos}
          label={t("dobletes.ajustes.guardar", "Guardar ajustes")}
          saving={guardando}
          onSave={guardar}
        />
      )}
    </div>
  );
}
