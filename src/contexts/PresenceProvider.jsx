import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { getPresenceConnectionCounts, PRESENCE_TOPIC } from "../services/presence";
import { PresenceContext } from "./presenceContext";

export function PresenceProvider({ children }) {
  const [connectionCounts, setConnectionCounts] = useState({});
  const [presenceError, setPresenceError] = useState(null);

  useEffect(() => {
    let active = true;
    let channel;

    async function startPresence() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        const sessionError = error || new Error("No authenticated session is available for presence.");
        console.error("Unable to start online presence:", sessionError);
        setPresenceError(sessionError);
        return;
      }

      const userId = data.session.user.id;
      channel = supabase.channel(PRESENCE_TOPIC, {
        config: {
          private: true,
          presence: { key: userId },
        },
      });

      const updatePresence = () => {
        if (active) {
          setConnectionCounts(getPresenceConnectionCounts(channel.presenceState()));
        }
      };

      channel
        .on("presence", { event: "sync" }, updatePresence)
        .on("presence", { event: "join" }, updatePresence)
        .on("presence", { event: "leave" }, updatePresence)
        .subscribe(async (status, subscribeError) => {
          if (!active) return;

          if (status === "SUBSCRIBED") {
            setPresenceError(null);
            try {
              const { error: trackError } = await channel.track({
                user_id: userId,
                connection_id: crypto.randomUUID(),
                online_at: new Date().toISOString(),
              });
              if (trackError && active) {
                console.error("Unable to publish online presence:", trackError);
                setPresenceError(trackError);
              }
            } catch (trackError) {
              if (!active) return;
              console.error("Unable to publish online presence:", trackError);
              setPresenceError(trackError);
            }
            updatePresence();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            const error = subscribeError || new Error(`Presence channel status: ${status}`);
            console.error("Unable to subscribe to online presence:", error);
            setPresenceError(error);
          }
        });
    }

    startPresence().catch((error) => {
      if (!active) return;
      console.error("Unable to start online presence:", error);
      setPresenceError(error);
    });

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel).then((status) => {
          if (status !== "ok") {
            console.warn("Presence channel cleanup returned:", status);
          }
        }).catch((error) => {
          console.error("Unable to clean up the presence channel:", error);
        });
      }
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ connectionCounts, presenceError }}>
      {children}
    </PresenceContext.Provider>
  );
}
