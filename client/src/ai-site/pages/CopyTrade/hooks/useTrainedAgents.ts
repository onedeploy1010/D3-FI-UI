import { useState, useCallback, useEffect } from "react";
import { useGetUserAgents, useSaveUserAgents } from "@ai/api-client-react";
import type { TrainedAgent } from "../types";

const CHANGE_EVENT = "alphacore:trained-agents-changed";

export function useTrainedAgents() {
  const { data, isLoading } = useGetUserAgents();
  const saveMutation = useSaveUserAgents();
  const [agents, setAgentsState] = useState<TrainedAgent[]>([]);

  useEffect(() => {
    if (data?.agents) {
      setAgentsState(data.agents as TrainedAgent[]);
    }
  }, [data]);

  const persist = useCallback(
    (next: TrainedAgent[]) => {
      setAgentsState(next);
      saveMutation.mutate(next);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    },
    [saveMutation],
  );

  const setAgents = useCallback((next: TrainedAgent[]) => persist(next), [persist]);

  const toggleCandidate = useCallback(
    (id: string) => {
      setAgentsState((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, isCandidate: !a.isCandidate } : a));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const addAgents = useCallback(
    (incoming: TrainedAgent[]) => {
      setAgentsState((prev) => {
        const existing = new Set(prev.map((a) => a.id));
        const next = [...prev, ...incoming.filter((a) => !existing.has(a.id))];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateAgent = useCallback(
    (id: string, patch: Partial<TrainedAgent>) => {
      setAgentsState((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { agents, setAgents, addAgents, updateAgent, toggleCandidate, isLoading };
}
