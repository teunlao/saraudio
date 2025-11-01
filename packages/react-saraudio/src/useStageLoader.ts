import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

interface StageLoaderParams<TStage> {
  enabled: boolean;
  loadStage: () => Promise<TStage>;
  onMissing(): Error;
  setLoadError: Dispatch<SetStateAction<Error | null>>;
}

export function useStageLoader<TStage>(params: StageLoaderParams<TStage>): TStage | null {
  const { enabled, loadStage, onMissing, setLoadError } = params;
  const [stage, setStage] = useState<TStage | null>(null);
  useEffect(() => {
    if (!enabled) {
      setStage(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const created = await loadStage();
        if (cancelled) return;
        setStage(created);
        setLoadError(null);
      } catch {
        if (cancelled) return;
        setStage(null);
        setLoadError((prev) => prev ?? onMissing());
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, loadStage, onMissing, setLoadError]);

  return stage;
}
