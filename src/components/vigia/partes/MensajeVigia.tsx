import { partirMensaje, partirNegritas } from "./bloquesDeVigia";

/** Una línea con sus **negritas**. */
function Linea({ texto }: { texto: string }) {
  return (
    <>
      {partirNegritas(texto).map((p, i) =>
        p.negrita ? (
          <strong key={i} className="font-semibold" style={{ color: "var(--ink)" }}>
            {p.texto}
          </strong>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

/**
 * La respuesta de VigIA con forma: párrafos, títulos de sección, viñetas y las
 * listas de cifras («Clientes: 0») como una cuadrícula de indicadores. Los
 * ceros van atenuados: lo que hay que mirar es lo que NO es cero.
 */
export default function MensajeVigia({ texto }: { texto: string }) {
  const bloques = partirMensaje(texto);

  return (
    <div className="flex flex-col gap-2.5 text-[13.5px] leading-relaxed">
      {bloques.map((b, i) => {
        if (b.tipo === "titulo")
          return (
            <p
              key={i}
              className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--brand-text)" }}
            >
              {b.texto}
            </p>
          );
        if (b.tipo === "lista")
          return (
            <ul key={i} className="flex flex-col gap-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-[0.55em] size-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--brand)" }}
                  />
                  <span className="min-w-0">
                    <Linea texto={it} />
                  </span>
                </li>
              ))}
            </ul>
          );
        if (b.tipo === "cifras")
          return (
            <div key={i} className="grid grid-cols-2 gap-1.5">
              {b.items.map((c, j) => {
                const cero = c.numero === 0;

                return (
                  <div
                    key={j}
                    className="flex min-w-0 flex-col justify-between gap-0.5 rounded-xl border px-2.5 py-2"
                    style={{
                      borderColor: cero
                        ? "var(--hairline)"
                        : "color-mix(in oklab, var(--brand) 35%, var(--hairline))",
                      background: cero
                        ? "color-mix(in oklab, var(--ink) 3%, transparent)"
                        : "color-mix(in oklab, var(--brand) 9%, transparent)",
                    }}
                  >
                    <span
                      className="text-[18px] font-bold leading-none tabular-nums"
                      style={{
                        fontFamily: "var(--font-display)",
                        color: cero ? "var(--ink-faint)" : "var(--ink)",
                      }}
                    >
                      {c.valor}
                    </span>
                    <span
                      className="text-[11px] leading-snug"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {c.etiqueta}
                    </span>
                  </div>
                );
              })}
            </div>
          );

        return (
          <p key={i} style={{ color: "var(--ink)" }}>
            <Linea texto={b.texto} />
          </p>
        );
      })}
    </div>
  );
}
