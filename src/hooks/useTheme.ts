import { useCallback, useEffect, useState } from 'react';
import { settingsRepo } from '../services/repositories';
import type { ThemeMode } from '../types';

const META_ID = 'theme-color-meta';
const THEME_COLORS: Record<ThemeMode, string> = {
  light: '#fdf8f8',
  dark: '#131312',
};

function readTheme(): ThemeMode {
  return settingsRepo.get().theme || 'light';
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
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
 * Explicit Light/Dark theme state persisted through the settings repository.
 * There is intentionally no system mode: the user always chooses.
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
