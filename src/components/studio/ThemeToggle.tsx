import { useEffect, useState } from "react";

const KEY = "autostudio-theme";
type Theme = "light" | "dark";

function apply(t: Theme) {
  document.documentElement.classList.toggle("light", t === "light");
}

/** Light/dark switch; defaults to the system preference until the user picks. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Theme | null;
    const t = saved ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(t);
    apply(t);
  }, []);

  const flip = () => {
    const t: Theme = theme === "dark" ? "light" : "dark";
    setTheme(t);
    apply(t);
    localStorage.setItem(KEY, t);
  };

  return (
    <button
      onClick={flip}
      aria-label="Switch light or dark theme"
      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
    >
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
