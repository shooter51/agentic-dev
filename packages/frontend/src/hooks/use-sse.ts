import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { SSE_QUERY_MAP } from "../lib/sse-query-contract";
import { useUIStore } from "../stores/ui-store";

export function useSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    for (const [eventName, getQueryKeys] of Object.entries(SSE_QUERY_MAP)) {
      es.addEventListener(eventName, (event: MessageEvent) => {
        const data = JSON.parse(event.data as string) as unknown;

        // Queue task-updated events during active drag to prevent
        // re-renders under the user's cursor mid-drag (ADR-0007)
        const isDragging = useUIStore.getState().isDragging;
        if (isDragging && eventName === "task-updated") {
          useUIStore.getState().queueDragEvent({ eventName, data });
          return;
        }

        const queryKeys = getQueryKeys(data);
        for (const key of queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }

    es.addEventListener("full-sync", () => {
      queryClient.invalidateQueries();
    });

    es.onerror = () => {
      // EventSource auto-reconnects with Last-Event-ID
    };

    return () => {
      es.close();
    };
  }, [queryClient]);
}
