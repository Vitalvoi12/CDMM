import { useCallback, useEffect, useState } from 'react';
import { settingsRepo } from '../services/repositories';
import type { ThemeMode } from '../types';

const META_ID = 'theme-color-meta';
const THEME_COLORS: Record<ThemeMode, string> = {
  light: '#f6f1e6',
  dark: '#12100e',
};

function readTheme(): ThemeMode {
  const t = settingsRepo.get().theme;
  return t === 'light' || t === 'dark' ? t : 'dark';
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  let meta = document.getElementById(META_ID) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.id = META_ID;
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}

/**
 * Explicit theme state (light/dark) persisted through the settings
 * repository. There is intentionally no system mode: the user always chooses.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    settingsRepo.update({ theme: mode });
    setThemeState(mode);
  }, []);

  return { theme, setTheme };
}

/** Apply the persisted theme once at app startup. */
export function initTheme() {
  applyTheme(readTheme());
}
