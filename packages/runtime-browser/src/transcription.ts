import {
  type CreateTranscriptionOptions as BaseOptions,
  createTranscription as createTranscriptionBase,
  type TranscriptionController,
} from '@saraudio/runtime-base';

import { createLogger, type Logger } from '@saraudio/utils';

export type CreateTranscriptionOptions = Omit<BaseOptions, 'logger'> & {
  logger?: boolean | 'error' | 'warn' | 'info' | 'debug' | Logger;
};

export function createTranscription(options: CreateTranscriptionOptions): TranscriptionController {
  const { logger: loggerOption, ...rest } = options;

  let logger: Logger | undefined;
  if (loggerOption === true) {
    logger = createLogger({ level: 'debug' });
  } else if (typeof loggerOption === 'string') {
    logger = createLogger({ level: loggerOption });
  } else if (loggerOption && typeof loggerOption === 'object') {
    logger = loggerOption;
  }

  return createTranscriptionBase({
    ...rest,
    logger,
  });
}

export type { TranscriptionController };
