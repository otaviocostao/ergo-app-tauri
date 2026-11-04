import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalAuth } from "../auth/AuthContext";
import { settingsService, SETTINGS_UPDATED_EVENT, type ModuleSettings, type SettingsUpdatedDetail } from "../services/settingsService";

/** Module settings of the signed-in account; guests and previews keep every module enabled. */
export function useModuleSettings() {
  const auth = useOptionalAuth();
  const userId = auth?.session.kind === "authenticated" ? auth.session.user.id : null;
  const [settings, setSettings] = useState<ModuleSettings | null>(null);
  const [isLoading, setIsLoading] = useState(userId !== null);
  const [error, setError] = useState<unknown>(null);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setSettings(null);
    setError(null);
    if (userId === null) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await settingsService.get();
      if (request === requestRef.current) setSettings(loaded);
    } catch (loadError) {
      if (request === requestRef.current) setError(loadError);
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
    // A late response must not reach the next account.
    return () => { requestRef.current++; };
  }, [reload]);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const { settings: updated, fields } = (event as CustomEvent<SettingsUpdatedDetail>).detail;
      if (updated.userId !== userId) return;
      requestRef.current++;
      const patch = Object.fromEntries(fields.map(field => [field, updated[field]]));
      setSettings(current => current ? { ...current, ...patch } : updated);
      setError(null);
      setIsLoading(false);
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
  }, [userId]);

  return { settings, setSettings, isLoading, error, reload, userId };
}
