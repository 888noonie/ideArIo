export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ideario-theme';

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Ignore localStorage errors
  }
  return 'dark'; // Neon Turquoise is the default
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore localStorage errors
  }
}

/** Apply the theme to <html data-theme="...">. */
export function applyTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
