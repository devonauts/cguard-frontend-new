import { useEffect, useRef, useState } from "react";

/**
 * Devuelve una copia de `valor` que cambia como mucho una vez cada `periodoMs`,
 * conservando SIEMPRE el último (borde de salida garantizado).
 *
 * ── POR QUÉ NO VALE `useDebouncedValue` ─────────────────────────────────────
 * El de al lado espera a que haya silencio, y para un buscador es lo correcto:
 * se teclea a ráfagas y luego se para. Aquí la fuente no se para nunca —son
 * posiciones de GPS llegando por socket— así que un `debounce` no publicaría
 * jamás mientras hubiera gente moviéndose, que es justo cuando hace falta.
 *
 * Esto es lo contrario: publica ya la primera vez, y a partir de ahí deja pasar
 * uno cada `periodoMs` con el más reciente que haya llegado. La cadencia queda
 * acotada tanto si entra un evento por minuto como si entran treinta y tres por
 * segundo.
 *
 * ── PARA QUÉ SE ESCRIBIÓ ────────────────────────────────────────────────────
 * `calcularCobertura` es O(puestos × personas) con haversine o punto-en-polígono
 * por par, y colgaba de `useMemo(…, [entities])`. Cada `location:update` que
 * mueve a alguien crea un array nuevo, así que con 1.000 vigilantes en
 * movimiento eran 33 recálculos por segundo de TODOS los pares.
 *
 * Un puesto no cambia de «cubierto» a «sin cubrir» treinta y tres veces por
 * segundo: cambia cuando alguien cruza la geocerca, y medio segundo de retraso
 * en pintarlo no lo ve nadie. El movimiento del marcador sigue a pantalla
 * completa —de eso se encarga `mapMotion`, que no pasa por aquí—; lo que se
 * atenúa es sólo el cálculo caro.
 *
 *   const paraCobertura = useValorConRitmo(entities, 500);
 *   const cobertura = useMemo(() => calcularCobertura(paraCobertura), [paraCobertura]);
 */
export function useValorConRitmo<T>(valor: T, periodoMs = 500): T {
  const [lento, setLento] = useState<T>(valor);
  /** Cuándo se publicó por última vez. En 0 para que el primero salga ya. */
  const ultimaRef = useRef(0);
  /** Lo último que se ha visto, publicado o no. */
  const pendienteRef = useRef<T>(valor);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendienteRef.current = valor;
    const ahora = Date.now();
    const desdeLaUltima = ahora - ultimaRef.current;

    if (desdeLaUltima >= periodoMs) {
      ultimaRef.current = ahora;
      setLento(valor);

      return;
    }
    // Ya hay una publicación en cola: cuando le toque se llevará el valor más
    // reciente, no éste. Programar otra sólo multiplicaría los temporizadores.
    if (temporizadorRef.current) return;
    temporizadorRef.current = setTimeout(() => {
      temporizadorRef.current = null;
      ultimaRef.current = Date.now();
      setLento(pendienteRef.current);
    }, periodoMs - desdeLaUltima);
  }, [valor, periodoMs]);

  // El temporizador pendiente se cancela al desmontar; si no, publicaría estado
  // sobre un componente que ya no está.
  useEffect(
    () => () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    },
    [],
  );

  return lento;
}

export default useValorConRitmo;
