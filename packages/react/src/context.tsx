import type { BrowserRuntime, BrowserRuntimeOptions, FallbackReason } from '@saraudio/runtime-browser';
import { createBrowserRuntime } from '@saraudio/runtime-browser';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface SaraudioProviderProps {
  runtime?: BrowserRuntime;
  runtimeOptions?: BrowserRuntimeOptions;
  children: ReactNode;
}

interface SaraudioContextValue {
  runtime: BrowserRuntime | null;
  lastFallback: FallbackReason | null;
}

const SaraudioContext = createContext<SaraudioContextValue | null>(null);

export const SaraudioProvider = ({ runtime: runtimeProp, runtimeOptions, children }: SaraudioProviderProps) => {
  const runtimeRef = useRef<BrowserRuntime | null>(runtimeProp ?? null);
  const [lastFallback, setLastFallback] = useState<FallbackReason | null>(null);

  const runtime = useMemo<BrowserRuntime | null>(() => {
    if (runtimeProp) {
      runtimeRef.current = runtimeProp;
      return runtimeProp;
    }

    if (runtimeRef.current) {
      return runtimeRef.current;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const mergedOptions: BrowserRuntimeOptions | undefined = runtimeOptions
      ? {
          ...runtimeOptions,
          onFallback: (reason: FallbackReason) => {
            setLastFallback(reason);
            runtimeOptions.onFallback?.(reason);
          },
        }
      : {
          onFallback: (reason: FallbackReason) => {
            setLastFallback(reason);
          },
        };

    const instance = createBrowserRuntime(mergedOptions);
    runtimeRef.current = instance;
    return instance;
  }, [runtimeOptions, runtimeProp]);

  useEffect(() => {
    if (!runtime) {
      return;
    }

    return () => {
      if (!runtimeProp && runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
    };
  }, [runtime, runtimeProp]);

  useEffect(() => {
    if (runtime) {
      setLastFallback(null);
    }
  }, [runtime]);

  const value = useMemo<SaraudioContextValue>(
    () => ({
      runtime,
      lastFallback,
    }),
    [runtime, lastFallback],
  );

  return <SaraudioContext.Provider value={value}>{children}</SaraudioContext.Provider>;
};

export interface SaraudioResolvedContext {
  runtime: BrowserRuntime;
  lastFallback: FallbackReason | null;
}

export const useSaraudioContext = (): SaraudioResolvedContext => {
  const value = useContext(SaraudioContext);
  if (!value) {
    throw new Error('Saraudio runtime is not available. Wrap your tree with <SaraudioProvider>.');
  }
  const { runtime, lastFallback } = value;
  if (!runtime) {
    throw new Error(
      'Saraudio runtime is not initialised. Ensure <SaraudioProvider> runs in the browser or pass runtime prop.',
    );
  }
  return { runtime, lastFallback };
};

export const useSaraudioRuntime = (override?: BrowserRuntime): BrowserRuntime => {
  const { runtime } = useSaraudioContext();
  return override ?? runtime;
};

export const useSaraudioFallbackReason = (): FallbackReason | null => {
  const context = useContext(SaraudioContext);
  return context?.lastFallback ?? null;
};
