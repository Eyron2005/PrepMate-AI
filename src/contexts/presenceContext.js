import { createContext, useContext } from "react";

export const PresenceContext = createContext(null);

export function usePresence() {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error("usePresence must be used within a PresenceProvider.");
  }
  return context;
}
