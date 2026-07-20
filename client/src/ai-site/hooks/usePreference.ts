import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiHeaders } from "@ai/api-client-react";
import { aiFetch } from "@/lib/aiApi";

function fetchPreferences(): Promise<Record<string, unknown>> {
  return aiFetch<Record<string, unknown>>("/user/preferences", { headers: apiHeaders() });
}

function putPreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return aiFetch<Record<string, unknown>>("/user/preferences", {
    method: "PUT",
    headers: apiHeaders(),
    body: patch,
  });
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
