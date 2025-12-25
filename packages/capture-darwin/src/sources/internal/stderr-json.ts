import type { Logger } from '@saraudio/utils';

type MessageEnvelope = {
  message_type?: string;
  data?: unknown;
};

export const parseAbridgedLine = (line: string): MessageEnvelope | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as MessageEnvelope;
  } catch {
    return null;
  }
};

export const handleStderrLine = (logger: Logger, line: string): void => {
  const parsed = parseAbridgedLine(line);
  if (!parsed) {
    logger.debug('capture stderr', { line });
    return;
  }

  const type = String(parsed.message_type ?? '');
  const data = parsed.data;

  if (type === 'error') {
    logger.error('capture error', { data });
    return;
  }
  if (type === 'info') {
    logger.info('capture info', { data });
    return;
  }
  if (type === 'debug') {
    logger.debug('capture debug', { data });
    return;
  }
  logger.debug('capture message', { type, data });
};
