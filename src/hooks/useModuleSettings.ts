import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalAuth } from "../auth/AuthContext";
import { settingsService, type ModuleSettings } from "../services/settingsService";

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

  return { settings, setSettings, isLoading, error, reload, userId };
}
