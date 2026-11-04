import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;
      if (!active) return;

      switch (event) {
        case "SIGNED_OUT":
          setSession(null);
          break;
        case "INITIAL_SESSION":
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
        default:
          setSession(nextSession);
      }

      setAuthError(null);
      setIsInitialized(true);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;

      if (error) {
        console.error("Unable to restore the authentication session:", error);
        setAuthError(error);
      } else {
        setSession(data.session);
      }
      setIsInitialized(true);
    }).catch((error) => {
      if (!active || authEventReceived) return;

      console.error("Unable to restore the authentication session:", error);
      setAuthError(error);
      setIsInitialized(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, isInitialized, authError }}>
      {children}
    </AuthContext.Provider>
  );
}
