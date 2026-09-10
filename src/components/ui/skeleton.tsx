import { cn } from "@/lib/utils";

/* Fantasma hundido: el hueco de un contenido que aún no llegó tiene que leerse
   como el pozo de un campo, no como un bloque de color. */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--r-md)] bg-[var(--glass-sunken)] motion-reduce:animate-none!",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
