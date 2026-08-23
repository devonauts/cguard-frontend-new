import { createContext, useContext, useEffect, useState } from "react";
import { leerAparienciaDeLaCuenta, guardarApariencia } from "@/lib/appearanceSync";

/**
 * Claro u oscuro, guardado en la CUENTA (`users.appearance.theme`) para que te
 * siga entre navegadores y máquinas. `localStorage` se queda como caché del
 * primer pintado: sin ella arrancarías en claro y saltarías a oscuro cuando
 * responda el servidor. Al llegar la cuenta, la cuenta manda.
 */

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

function getInitialTheme(): Theme {
  try {
    // Our own key takes priority
    const stored = localStorage.getItem("cguard-theme");
    if (stored === "dark" || stored === "light") return stored;

    // Migrate legacy HeroUI key (synchronously, before first render)
    const legacy = localStorage.getItem("heroui-theme");
    if (legacy === "dark" || legacy === "light") {
      localStorage.setItem("cguard-theme", legacy);
      localStorage.removeItem("heroui-theme");
      return legacy;
    }

    // Last resort: check actual DOM class (HeroUI script may have set it)
    if (document.documentElement.classList.contains("dark")) return "dark";

    // System preference
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {}
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // On mount: clean up any remaining heroui key
  useEffect(() => {
    try { localStorage.removeItem("heroui-theme"); } catch {}
  }, []);

  // Al arrancar: el modo guardado en la cuenta gana sobre el de este navegador.
  useEffect(() => {
    let vivo = true;
    leerAparienciaDeLaCuenta().then((a) => {
      if (!vivo) return;
      if (a?.theme === "light" || a?.theme === "dark") {
        setThemeState(a.theme);
        try { localStorage.setItem("cguard-theme", a.theme); } catch {}
      }
    });
    return () => { vivo = false; };
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("cguard-theme", t); } catch {}
    guardarApariencia({ theme: t });
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
