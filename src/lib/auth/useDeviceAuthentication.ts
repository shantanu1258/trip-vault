import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import {
  offlineDeviceProfileId,
  rememberDeviceProfile,
  resolveDeviceProfileId
} from "./deviceSession";

export function useDeviceAuthentication() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const resolve = () => {
      setAuthenticated(null);
      void resolveDeviceProfileId().then((profileId) => {
        if (active) setAuthenticated(Boolean(profileId));
      });
    };

    resolve();
    const authSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user.id) {
        rememberDeviceProfile(session.user.id);
        setAuthenticated(true);
      } else {
        setAuthenticated(Boolean(offlineDeviceProfileId()));
      }
    }).data.subscription;
    window.addEventListener("online", resolve);
    window.addEventListener("offline", resolve);

    return () => {
      active = false;
      authSubscription?.unsubscribe();
      window.removeEventListener("online", resolve);
      window.removeEventListener("offline", resolve);
    };
  }, []);

  return authenticated;
}
