import { Fragment, ReactNode } from "react";

/**
 * El texto de un aviso, con un formato MÍNIMO y seguro: párrafos (línea en
 * blanco), viñetas («- »), **negrita** y [enlaces](https://…). Nada de HTML:
 * todo se pinta como texto de React, así que un aviso nunca puede inyectar nada.
 * El mismo formato lo muestra la vista previa del superadmin.
 */
const enlaceValido = (u: string) => /^https:\/\//i.test(u) || (u.startsWith("/") && !u.startsWith("//"));

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1]) partes.push(<strong key={`${clave}-b${i++}`}>{m[1]}</strong>);
    else if (m[2] && m[3] && enlaceValido(m[3]))
      partes.push(
        <a key={`${clave}-a${i++}`} href={m[3]} target={m[3].startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="underline underline-offset-2">
          {m[2]}
        </a>,
      );
    else partes.push(m[0]);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export default function TextoDeAviso({ texto, className = "" }: { texto: string; className?: string }) {
  const bloques = String(texto || "").split(/\n\s*\n/);
  return (
    <div className={`space-y-2 ${className}`}>
      {bloques.map((b, i) => {
        const lineas = b.split("\n");
        if (lineas.every((l) => /^\s*[-•]\s+/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lineas.map((l, j) => <li key={j}>{enLinea(l.replace(/^\s*[-•]\s+/, ""), `${i}-${j}`)}</li>)}
            </ul>
          );
        return (
          <p key={i}>
            {lineas.map((l, j) => (
              <Fragment key={j}>{j > 0 && <br />}{enLinea(l, `${i}-${j}`)}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
