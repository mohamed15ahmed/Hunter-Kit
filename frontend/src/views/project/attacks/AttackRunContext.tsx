import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

type AttackRunState = {
  activeChannel: string | null;
  setActiveChannel: (channel: string | null) => void;
};

const AttackRunContext = createContext<AttackRunState | null>(null);

export function AttackRunProvider({ children }: { children: ReactNode }) {
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const value = useMemo(() => ({ activeChannel, setActiveChannel }), [activeChannel]);
  return <AttackRunContext.Provider value={value}>{children}</AttackRunContext.Provider>;
}

export function useAttackRun() {
  const value = useContext(AttackRunContext);
  if (!value) throw new Error('useAttackRun must be used inside AttackRunProvider');
  return value;
}
