import { describe, expect, it } from 'vitest';
import { Pipeline, type Stage, type StageController } from './pipeline';
import type { Frame } from './types';

const dummyFrame: Frame = { pcm: new Int16Array([0]), tsMs: 0, sampleRate: 16000, channels: 1 };

function makeController(
  id: string,
  opts: { key?: string; isEqualBoth?: boolean; tag?: string } = {},
  counters?: { creates: number; teardowns: number },
): StageController {
  return {
    id,
    key: opts.key,
    create: () => {
      if (counters) counters.creates += 1;
      const stage: Stage = {
        setup() {},
        handle() {},
        teardown() {
          if (counters) counters.teardowns += 1;
        },
      };
      return stage;
    },
    isEqual: opts.isEqualBoth === true ? (other) => other.id === id && other.key === opts.key : undefined,
  };
}

describe('Pipeline controller matching', () => {
  it('reuses stage when id and key are equal (no recreate/teardown)', () => {
    const ctrs = { creates: 0, teardowns: 0 };
    const p = new Pipeline({ now: () => 0, createId: () => 'x' });
    p.configure({ stages: [makeController('A', { key: 'v1' }, ctrs)] });
    p.push(dummyFrame);
    // same id+key → reuse
    p.configure({ stages: [makeController('A', { key: 'v1' }, ctrs)] });
    p.push(dummyFrame);
    expect(ctrs.creates).toBe(1);
    expect(ctrs.teardowns).toBe(0);
  });

  it('replaces stage when key differs', () => {
    const ctrs = { creates: 0, teardowns: 0 };
    const p = new Pipeline({ now: () => 0, createId: () => 'x' });
    p.configure({ stages: [makeController('A', { key: 'v1' }, ctrs)] });
    p.push(dummyFrame);
    // different key → replace
    p.configure({ stages: [makeController('A', { key: 'v2' }, ctrs)] });
    p.push(dummyFrame);
    expect(ctrs.creates).toBe(2);
    expect(ctrs.teardowns).toBe(1);
  });

  it('uses symmetric isEqual when keys are missing', () => {
    const ctrs = { creates: 0, teardowns: 0 };
    const p = new Pipeline({ now: () => 0, createId: () => 'x' });
    // no key, but both supply isEqual that agrees
    p.configure({ stages: [makeController('A', { isEqualBoth: true }, ctrs)] });
    p.push(dummyFrame);
    p.configure({ stages: [makeController('A', { isEqualBoth: true }, ctrs)] });
    p.push(dummyFrame);
    expect(ctrs.creates).toBe(1);
    expect(ctrs.teardowns).toBe(0);
  });

  it('does not match when only one side can compare (asymmetric), so it replaces', () => {
    const ctrs = { creates: 0, teardowns: 0 };
    const p = new Pipeline({ now: () => 0, createId: () => 'x' });
    // First has isEqual, second has neither key nor isEqual
    const c1 = makeController('A', { isEqualBoth: true }, ctrs);
    const c2: StageController = {
      id: 'A',
      create: c1.create,
    };
    p.configure({ stages: [c1] });
    p.push(dummyFrame);
    p.configure({ stages: [c2] });
    expect(ctrs.creates).toBe(2);
    expect(ctrs.teardowns).toBe(1);
  });
});
