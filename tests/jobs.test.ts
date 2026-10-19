import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanQueue } from '../backend/src/jobs.js';

test('tool queue serializes across projects, deduplicates, and cancels pending work', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const executed: string[] = [];
  let active = 0, maximum = 0;
  const queue = new ScanQueue(async (channel, args) => {
    active++; maximum = Math.max(maximum, active); executed.push(channel);
    try { if (channel === 'first') await gate; return { success: true, value: args[0], stderr: 'internal log', command: 'internal command' }; }
    finally { active--; }
  });
  const first = queue.submit('first', [1], 'project-one');
  const duplicate = queue.submit('first', [2], 'project-one');
  assert.equal(duplicate.id, first.id);
  const second = queue.submit('second', [3], 'project-two');
  const third = queue.submit('third', [4], 'project-one');
  assert.equal(queue.view(second.id)?.position, 1);
  assert.equal(queue.view(third.id)?.position, 2);
  assert.equal(queue.cancel(first.id), false);
  assert.equal(queue.cancel(second.id), true);
  assert.equal((await queue.wait(second.id)).cancelled, true);
  release();
  await Promise.all([queue.wait(first.id), queue.wait(third.id)]);
  assert.equal(maximum, 1);
  assert.deepEqual(executed, ['first', 'third']);
  assert.equal(queue.view(first.id)?.result?.value, 1);
  assert.equal(queue.view(first.id)?.result?.stderr, undefined);
  assert.equal(queue.view(first.id)?.result?.command, undefined);
});

test('a failed job cannot strand the next tool job', async () => {
  const queue = new ScanQueue(async channel => {
    if (channel === 'broken') throw new Error('scanner exited');
    return { success: true };
  });
  const broken = queue.submit('broken', [], 'one');
  const next = queue.submit('working', [], 'two');
  assert.equal((await queue.wait(broken.id)).success, false);
  assert.equal((await queue.wait(next.id)).success, true);
  assert.equal(queue.view(broken.id)?.state, 'failed');
  assert.equal(queue.view(next.id)?.state, 'completed');
});
