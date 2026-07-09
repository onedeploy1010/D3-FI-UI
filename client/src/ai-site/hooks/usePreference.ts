import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiHeaders } from "@ai/api-client-react";

async function fetchPreferences(): Promise<Record<string, unknown>> {
  const r = await fetch("/api/user/preferences", { headers: apiHeaders() });
  if (!r.ok) throw new Error("preferences fetch failed");
  return r.json() as Promise<Record<string, unknown>>;
}

async function putPreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch("/api/user/preferences", {
    method: "PUT",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("preferences update failed");
  return r.json() as Promise<Record<string, unknown>>;
}

/** Persist a single preference key in Supabase (replaces localStorage). */
export function usePreference<T>(key: string, defaultValue: T) {
  const qc = useQueryClient();
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: fetchPreferences,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (value: T) => putPreferences({ [key]: value }),
    onSuccess: (next) => qc.setQueryData(["preferences"], next),
  });

  const [value, setValueLocal] = useState<T>(defaultValue);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!prefs || hydrated.current) return;
    if (key in prefs) {
      setValueLocal(prefs[key] as T);
    }
    hydrated.current = true;
  }, [prefs, key]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueLocal((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        mutation.mutate(resolved);
        return resolved;
      });
    },
    [mutation],
  );

  return [value, setValue] as const;
}
