import { useCallback } from "react";
import { usePreference } from "@ai/hooks/usePreference";
import type { WatchlistEntry, Trader } from "../types";

const STORAGE_KEY = "watchlist";

function getRiskCategory(trader: Trader): "conservative" | "stable" | "aggressive" {
  if (trader.drawdown <= 12 && trader.copyability >= 60) return "conservative";
  if (trader.drawdown >= 25 || trader.edge >= 85) return "aggressive";
  return "stable";
}

export function useWatchlist() {
  const [entries, setEntries] = usePreference<WatchlistEntry[]>(STORAGE_KEY, []);

  const add = useCallback(
    (trader: Trader) => {
      setEntries((prev) => {
        if (prev.some((e) => e.trader.address === trader.address)) return prev;
        return [
          ...prev,
          {
            trader,
            addedAt: new Date().toISOString(),
            paused: false,
            allocation: 5,
            riskCategory: getRiskCategory(trader),
          },
        ];
      });
    },
    [setEntries],
  );

  const remove = useCallback(
    (address: string) => {
      setEntries((prev) => prev.filter((e) => e.trader.address !== address));
    },
    [setEntries],
  );

  const toggle = useCallback(
    (address: string) => {
      setEntries((prev) =>
        prev.map((e) => (e.trader.address === address ? { ...e, paused: !e.paused } : e)),
      );
    },
    [setEntries],
  );

  const setAllocation = useCallback(
    (address: string, allocation: number) => {
      setEntries((prev) =>
        prev.map((e) => (e.trader.address === address ? { ...e, allocation } : e)),
      );
    },
    [setEntries],
  );

  const has = useCallback(
    (address: string) => entries.some((e) => e.trader.address === address),
    [entries],
  );

  return { entries, add, remove, toggle, setAllocation, has };
}
