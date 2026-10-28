import { useEffect, useState } from "react";
import { api } from "../api/client";

/** Static app metadata (the beamline and logout URL) - fetched once, since
 * it comes from server config and doesn't change while the app is open. */
export function useAppInfo() {
  const [beamline, setBeamline] = useState("");
  const [logoutUrl, setLogoutUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api
      .info()
      .then((info) => {
        if (cancelled) return;
        setBeamline(info.beamline);
        setLogoutUrl(info.logout_url);
      })
      .catch(() => {
        /* the title bar just omits the beamline if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { beamline, logoutUrl };
}
