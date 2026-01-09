const STORAGE_KEY = 'supabase-settings';

export const loadSupabaseSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.supabaseUrl || !parsed.anonKey || !parsed.bucket) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveSupabaseSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

export const clearSupabaseSettings = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};