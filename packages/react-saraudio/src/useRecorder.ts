import type { Recorder, RecorderOptions } from '@saraudio/runtime-browser';
import { createRecorder } from '@saraudio/runtime-browser';
import { useEffect, useMemo } from 'react';

export type UseRecorderOptions = RecorderOptions;

// Thin React integration: create and dispose a runtime-browser Recorder.
// No extra state, no refs, no side effects besides disposal.
export const useRecorder = (options: UseRecorderOptions = {}): Recorder => {
  const recorder = useMemo(() => createRecorder(options), [options]);
  useEffect(() => () => recorder.dispose(), [recorder]);
  return recorder;
};
