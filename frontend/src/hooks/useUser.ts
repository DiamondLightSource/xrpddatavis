import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { User } from "../api/types";

/** The logged-in user - fetched once, since oauth2-proxy sends anyone without
 * a session to the login page before the app loads. Stays null when the
 * server has auth turned off (or the request fails). */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .user()
      .then((loggedIn) => {
        if (!cancelled) setUser(loggedIn ?? null);
      })
      .catch(() => {
        /* the title bar just omits the user if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user };
}
