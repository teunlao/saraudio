/** Normalize channel count to provider-supported 1 or 2. */
export function normalizeChannels(channels: number): 1 | 2 {
  return channels >= 2 ? 2 : 1;
}
