import { useEffect } from "react";

export type WorkspaceTheme = {
  primary_color: string;
  secondary_color: string;
  background: string;
  card: string;
  radius: string;
  heading_font: string;
  body_font: string;
};

export function ThemeProvider({ theme, children }: { theme?: WorkspaceTheme | null; children: React.ReactNode }) {
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const prev: Record<string, string> = {};
    const set = (k: string, v: string) => {
      prev[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    };
    set("--primary", theme.primary_color);
    set("--secondary", theme.secondary_color);
    set("--background", theme.background);
    set("--card", theme.card);
    set("--radius", theme.radius);
    set("--heading-font", `${theme.heading_font}, ui-sans-serif, system-ui, sans-serif`);
    set("--body-font", `${theme.body_font}, ui-sans-serif, system-ui, sans-serif`);
    return () => {
      Object.entries(prev).forEach(([k, v]) => {
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      });
    };
  }, [theme]);
  return <>{children}</>;
}
