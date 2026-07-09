import { createContext, useContext } from 'react';
import type { UnionViewModel } from '@/lib/unionViewModel';

export const UnionProfileContext = createContext<UnionViewModel | null>(null);

export function useUnionVm(): UnionViewModel {
  const ctx = useContext(UnionProfileContext);
  if (!ctx) {
    throw new Error('useUnionVm must be used within UnionProfileContext');
  }
  return ctx;
}
