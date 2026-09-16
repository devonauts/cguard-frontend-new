import { useEffect, useState } from "react";

/**
 * Devuelve una copia de `value` que sólo se actualiza tras `delay` de silencio.
 *
 * Para los buscadores: sin esto, la lista se vuelve a pedir en CADA tecla. En
 * la pantalla de vigilantes eso era una petición del censo entero (`limit:
 * 100000`) por pulsación — escribir un nombre de diez letras eran diez censos.
 *
 *   const debounced = useDebouncedValue(searchQuery, 400);
 *   // ...usa `debounced` en las dependencias del efecto, NO `searchQuery`.
 *
 * (El campo de texto sigue leyendo `searchQuery`, así que se escribe sin lag:
 * lo que se retrasa es la petición, no lo que se ve.)
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebouncedValue;
