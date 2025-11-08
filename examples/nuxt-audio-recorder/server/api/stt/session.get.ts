import { sessionAuthAdapter as deepgram } from '@saraudio/deepgram/server';
import { createSessionAuthHandler } from '@saraudio/runtime-node';
import { sessionAuthAdapter as soniox } from '@saraudio/soniox/server';
import { defineEventHandler, getRequestURL, setResponseStatus } from 'h3';

const handler = createSessionAuthHandler({
  adapters: [deepgram(), soniox()],
  ttlSafetyBufferMs: 2000,
});

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event).href;
  const req = new Request(url, { method: event.method });

  const res = await handler(req);
  const data = await res.json();
  setResponseStatus(event, res.status);
  return data;
});
