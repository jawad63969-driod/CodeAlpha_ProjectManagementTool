import { useEffect, useState } from 'react';

const KEY = 'taskforge.theme';
type Theme = 'light' | 'dark';

const initial = (): Theme => {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* private mode */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useTheme = (): { theme: Theme; toggle: () => void } => {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  return { theme, toggle: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')) };
};
