import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { getPresenceConnectionCounts, PRESENCE_TOPIC } from "../services/presence";
import { PresenceContext } from "./presenceContext";
import { useAuth } from "./authContext";

export function PresenceProvider({ children }) {
  const { session, loading } = useAuth();
  const userId = session?.user?.id;
  const [connectionCounts, setConnectionCounts] = useState({});
  const [presenceError, setPresenceError] = useState(null);

  useEffect(() => {
    let active = true;
    let removingChannel = false;
    let channel;

    if (loading || !userId) return undefined;

    const stopPresenceChannel = () => {
      if (!channel || removingChannel) return;
      removingChannel = true;
      supabase.removeChannel(channel).then((status) => {
        if (status !== "ok") {
          console.warn("Presence channel cleanup returned:", status);
        }
      }).catch((error) => {
        console.error("Unable to clean up the presence channel:", error);
      });
    };

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
          stopPresenceChannel();
        }
      });

    return () => {
      active = false;
      stopPresenceChannel();
    };
  }, [loading, userId]);

  return (
    <PresenceContext.Provider value={{ connectionCounts, presenceError }}>
      {children}
    </PresenceContext.Provider>
  );
}
