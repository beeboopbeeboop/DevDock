import { useCallback } from 'react';
import { loadSetting } from '../components/SettingsPanel';

export function useNotifications() {
  const enabled = loadSetting('desktop-notifications', false);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  const notify = useCallback(
    (title: string, options?: { body?: string; tag?: string }) => {
      if (!enabled) return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const n = new Notification(title, {
        body: options?.body,
        tag: options?.tag,
        silent: false,
      });

      setTimeout(() => n.close(), 5000);

      n.onclick = () => {
        window.focus();
        n.close();
      };
    },
    [enabled],
  );

  return { enabled, notify, requestPermission };
}
