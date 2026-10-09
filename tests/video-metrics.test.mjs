import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVideoMetrics, publicationRange } from '../src/lib/videoFilters.ts';

test('metrics match IDs, preserve null and reject invalid or unsolicited scores', () => {
  const result = normalizeVideoMetrics({ data: [
    { video_id: 'red', breakout_score: 10 },
    { video_id: 'blue', breakout_score: 2.65 },
    { video_id: 'boundary', breakout_score: 2 },
    { video_id: 'empty', breakout_score: null },
    { video_id: 'bad', breakout_score: '8' },
    { video_id: 'negative', breakout_score: -1 },
    { video_id: 'infinite', breakout_score: Infinity },
    { video_id: 'outsider', breakout_score: 20 },
  ] }, ['red', 'blue', 'boundary', 'empty', 'bad', 'negative', 'infinite', 'missing']);
  assert.deepEqual([...result], [['red', 10], ['blue', 2.65], ['boundary', 2], ['empty', null]]);
  assert.throws(() => normalizeVideoMetrics({}, ['red']));
});

test('inclusive GMT+7 dates include full end day and allow one-sided ranges', () => {
  const range = publicationRange('2026-10-09', '2026-10-09');
  assert.equal(range.gte.toISOString(), '2026-10-08T17:00:00.000Z');
  assert.equal(range.lt.toISOString(), '2026-10-09T17:00:00.000Z');
  assert.deepEqual(publicationRange(), {});
  assert.equal(publicationRange('2026-10-09').lt, undefined);
  assert.equal(publicationRange(undefined, '2026-10-09').gte, undefined);
  assert.throws(() => publicationRange('2026-02-30'));
  assert.throws(() => publicationRange('invalid'));
  assert.throws(() => publicationRange('2026-10-10', '2026-10-09'));
});

test('metrics tries remaining tokens after 403 and sends only long video IDs', async () => {
  const names = ['VIDIQ_BEARER_TOKEN', 'VIDIQ_BEARER_TOKEN2', 'VIDIQ_BEARER_TOKEN3', 'VIDIQ_BEARER_TOKEN4', 'VIDIQ_BEARER_TOKEN5', 'VIDIQ_BEARER_TOKEN6'];
  const previous = names.map(name => process.env[name]);
  names.forEach((name, index) => { if (index < 3) process.env[name] = `test-${index}`; else delete process.env[name]; });
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.vidiq.com/youtube/videos/metrics');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { longVideos: ['test-video'], shortVideos: [] });
    attempts++;
    return attempts < 3 ? new Response('', { status: 403 }) : Response.json({ data: [{ video_id: 'test-video', breakout_score: 10 }] });
  };
  try {
    const { getVidiqVideoMetrics } = await import('../src/lib/services/vidiq.ts');
    assert.deepEqual(await getVidiqVideoMetrics(['test-video']), { data: [{ video_id: 'test-video', breakout_score: 10 }] });
    assert.equal(attempts, 3);
    await assert.rejects(() => getVidiqVideoMetrics(Array(31).fill('video')));
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
