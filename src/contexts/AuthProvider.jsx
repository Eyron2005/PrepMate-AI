import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    session: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    let authEventSequence = 0;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      authEventSequence += 1;
      if (!active) return;

      switch (event) {
        case "INITIAL_SESSION":
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
          setAuthState({ session, loading: false, error: null });
          break;
        case "SIGNED_OUT":
          setAuthState({ session: null, loading: false, error: null });
          break;
        default:
          setAuthState({ session, loading: false, error: null });
      }
    });

    const initialEventSequence = authEventSequence;
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!active || authEventSequence !== initialEventSequence) return;
      if (error) {
        console.error("Unable to restore the authentication session:", error);
        setAuthState({ session: null, loading: false, error });
        return;
      }
      setAuthState({ session, loading: false, error: null });
    }).catch((error) => {
      if (!active || authEventSequence !== initialEventSequence) return;
      console.error("Unable to restore the authentication session:", error);
      setAuthState({ session: null, loading: false, error });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}
