import { aHHMM, aMinutos, nombreDeTramo } from './tramos';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ PLAZAS VA A CREAR ESTA ESTACIÓN
 *
 * El formulario del puesto pedía UN patrón de rotación «general» y no enseñaba
 * en ningún sitio cuántas plazas iban a salir de lo elegido ni con qué horas.
 * Mientras el ciclo fuera uno solo para todos daba igual; deja de dar igual en
 * cuanto cada plaza puede correr el suyo (BIOMAR: 07:00–23:00 en dos tramos,
 * la mañana en un ciclo y la tarde en otro): no se puede pedir «el ciclo de la
 * plaza 2» sin decir cuál es la plaza 2.
 *
 * Esto reproduce EXACTAMENTE lo que hace `stationAutoConfigService` al crear
 * las plazas, para que lo que se ve al configurar sea lo que se guarda. Si
 * aquello cambia, esto tiene que cambiar con ello.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface CicloRotacion {
  dayShifts: number;
  nightShifts: number;
  restDays: number;
}

export interface PlazaPrevista {
  /** Su `sortOrder`: el índice con el que el backend la empareja. */
  indice: number;
  /** «Fijo 1», «Fijo 2»… igual que las nombra el backend. */
  nombre: string;
  startTime: string;
  endTime: string;
  /** Cómo se llama su tramo aquí: mañana / tarde / noche. */
  tramo: string;
}

export interface EntradaDePlazas {
  scheduleType: '24h' | '12h-day' | '12h-night' | 'custom';
  /** Ventana de la estación (la del formulario). */
  inicio: string;
  fin: string;
  /** El ciclo de la estación: decide cuántas plazas teselan un 12 h. */
  ciclo?: CicloRotacion | null;
  /** Horas por vigilante en una estación personalizada ('' = toda la jornada). */
  blockHours?: number;
  restCoverage?: 'sacafranco' | 'alternate';
}

/** Minutos de cobertura de una ventana; 00:00→00:00 son 24 h, no 0. */
export function minutosDeVentana(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0;
  const w = (aMinutos(fin) - aMinutos(inicio) + 1440) % 1440;
  return w === 0 ? 1440 : w;
}

export function plazasPrevistas(e: EntradaDePlazas): PlazaPrevista[] {
  const inicio = e.inicio || '07:00';
  const fin = e.fin || '19:00';
  const dia = Math.max(0, Number(e.ciclo?.dayShifts) || 0);
  const noche = Math.max(0, Number(e.ciclo?.nightShifts) || 0);
  const libres = Math.max(0, Number(e.ciclo?.restDays) || 0);
  const trabajo = dia + noche;
  const largo = trabajo + libres;

  const plaza = (indice: number, startTime: string, endTime: string): PlazaPrevista => ({
    indice,
    nombre: `Fijo ${indice + 1}`,
    startTime,
    endTime,
    tramo: nombreDeTramo(startTime),
  });

  if (e.scheduleType === '24h') {
    /* Una ventana de «todo el día» (00:00–23:59) es el rótulo del servicio, no
       la hora del relevo: `stationAutoConfigService` la cambia por 07:00/19:00
       antes de crear las plazas, y aquí se hace lo mismo para que lo que se ve
       al configurar sea lo que se guarda. */
    const todoElDia = aMinutos(inicio) === 0 && (fin === '23:59' || aMinutos(fin) === 0);
    const ini = todoElDia ? '07:00' : inicio;
    const fn = todoElDia ? '19:00' : fin;
    // Las dos plazas comparten ventana y es la ROTACIÓN la que lleva a una a la
    // noche… salvo que el patrón no tenga segundo tramo: entonces la noche la
    // pone la VENTANA y la segunda plaza cubre el espejo.
    const sinFaseDeNoche = noche === 0;
    return [
      plaza(0, ini, fn),
      plaza(1, sinFaseDeNoche ? fn : ini, sinFaseDeNoche ? ini : fn),
    ];
  }

  if (e.scheduleType === '12h-day' || e.scheduleType === '12h-night') {
    // Cuando los días de trabajo TESELAN el ciclo (un 3-3 son dos personas que
    // se turnan) se crean tantas plazas como turnos hagan falta para cubrirlo.
    const teselan = trabajo > 0 && largo % trabajo === 0 ? Math.min(4, largo / trabajo) : 1;
    return Array.from({ length: teselan }, (_, i) => plaza(i, inicio, fin));
  }

  // Personalizada: la ventana se parte en bloques consecutivos, y en modo
  // «alternancia» cada bloque lleva varios fijos que se turnan día por medio.
  const ventana = minutosDeVentana(inicio, fin);
  const porBloque = Number(e.blockHours) > 0 ? Number(e.blockHours) * 60 : 0;
  const bloques = porBloque > 0 && ventana > 0 && ventana % porBloque === 0 ? ventana / porBloque : 1;
  const minBloque = ventana > 0 ? ventana / bloques : 0;
  let fijosPorBloque = 1;
  if (e.restCoverage === 'alternate' && trabajo > 0 && largo % trabajo === 0) {
    fijosPorBloque = largo / trabajo;
  }
  const base = aMinutos(inicio);
  const out: PlazaPrevista[] = [];
  for (let b = 0; b < bloques; b++) {
    for (let a = 0; a < fijosPorBloque; a++) {
      out.push(plaza(
        b * fijosPorBloque + a,
        minBloque > 0 ? aHHMM(base + b * minBloque) : inicio,
        minBloque > 0 ? aHHMM(base + (b + 1) * minBloque) : fin,
      ));
    }
  }
  return out.length ? out : [plaza(0, inicio, fin)];
}

/**
 * EL SEGUNDO TRAMO DE UNA PLAZA — el que hace cuando su ciclo sale del propio.
 *
 * El generador toma el bloque SIGUIENTE al de la plaza (`bloques[(propio+1) %
 * n]`), así que en 07:00–15:00 + 15:00–23:00 la mañana pasa a la tarde y la
 * tarde pasa a la mañana. En un puesto de 24 h las dos plazas comparten ventana
 * y el segundo tramo es la noche de siempre.
 */
export function bloqueSiguiente(
  plazas: PlazaPrevista[],
  indice: number,
  es24h: boolean,
): { clave: string; nombre: string } | null {
  if (es24h) return null; // las dos plazas comparten ventana: el segundo tramo es la noche
  const ventanas = Array.from(new Set(plazas.map((p) => `${p.startTime}|${p.endTime}`))).sort();
  if (ventanas.length < 2) return null;
  const mia = `${plazas[indice]?.startTime}|${plazas[indice]?.endTime}`;
  const i = ventanas.indexOf(mia);
  const clave = ventanas[((i < 0 ? 0 : i) + 1) % ventanas.length];
  return { clave, nombre: nombreDeTramo(clave.split('|')[0]) };
}

/**
 * El NOMBRE del segundo tramo, para los textos. Se devuelve la clave aparte
 * (`bloqueSiguiente`) porque una cobertura partida en cuatro bloques de 6 h
 * tiene DOS que se llaman «noche» (00–06 y 18–00): contar cobertura por el
 * nombre juntaría los dos en uno.
 */
export function tramoSiguiente(plazas: PlazaPrevista[], indice: number, es24h: boolean): string {
  return bloqueSiguiente(plazas, indice, es24h)?.nombre || 'noche';
}

/**
 * La semana de una plaza, escrita: «M M T T T L L».
 *
 * Es la lectura que el operador estaba haciendo a mano y que no cuadraba nunca,
 * porque el formulario decía «2-3-2» y él necesitaba saber si eso eran 2
 * mañanas o 2 tardes. Empieza en el día 0 del ciclo, que es el primer día de
 * trabajo del vigilante (su fecha de alta).
 */
export function secuenciaDelCiclo(
  ciclo: CicloRotacion | null | undefined,
  etiquetaPropia: string,
  etiquetaSiguiente: string,
): { letra: string; nombre: string; tipo: 'propio' | 'siguiente' | 'libre' }[] {
  if (!ciclo) return [];
  const dia = Math.max(0, Number(ciclo.dayShifts) || 0);
  const noche = Math.max(0, Number(ciclo.nightShifts) || 0);
  const libres = Math.max(0, Number(ciclo.restDays) || 0);
  const inicial = (s: string) => (s || '?').charAt(0).toUpperCase();
  return [
    ...Array.from({ length: dia }, () => ({ letra: inicial(etiquetaPropia), nombre: etiquetaPropia, tipo: 'propio' as const })),
    ...Array.from({ length: noche }, () => ({ letra: inicial(etiquetaSiguiente), nombre: etiquetaSiguiente, tipo: 'siguiente' as const })),
    ...Array.from({ length: libres }, () => ({ letra: 'L', nombre: 'libre', tipo: 'libre' as const })),
  ];
}
