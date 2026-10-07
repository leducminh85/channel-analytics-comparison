import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVideoPages, parseDuration } from '../src/lib/services/youtubeVideos.ts';

test('duration supports short videos, hours, days and unknown values', () => {
  assert.equal(parseDuration('PT59S'), 59);
  assert.equal(parseDuration('PT3M'), 180);
  assert.equal(parseDuration('PT1H2M3S'), 3723);
  assert.equal(parseDuration('P1DT1H'), 90000);
  assert.equal(parseDuration('PT0S'), 0);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('invalid'), null);
});

test('all playlist pages, batches of 50, unavailable videos, shorts and exact view counts', async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = 'test-key';
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input);
    calls.push(url);
    const resource = url.pathname.split('/').at(-1);
    if (resource === 'channels') return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'uploads' } } }] });
    if (resource === 'playlistItems') {
      const next = url.searchParams.has('pageToken');
      return Response.json({ items: Array.from({ length: next ? 3 : 50 }, (_, index) => ({ contentDetails: { videoId: `v${next ? 50 + index : index}` } })), ...(!next ? { nextPageToken: 'page2' } : {}) });
    }
    const ids = url.searchParams.get('id').split(',');
    assert.ok(ids.length <= 50);
    return Response.json({ items: ids.filter(id => id !== 'v52').map(id => ({ id, snippet: { channelId: 'channel', title: id, description: 'description', publishedAt: '2026-10-07T01:30:00Z', thumbnails: { high: { url: 'https://i.ytimg.com/test.jpg' } } }, contentDetails: { duration: 'PT30S' }, statistics: { viewCount: '9007199254740993' } })) });
  };
  try {
    const pages = [];
    for await (const page of fetchVideoPages('channel')) pages.push(page);
    assert.deepEqual(pages.map(page => page.length), [50, 2]);
    assert.equal(pages[0][0].durationSeconds, 30);
    assert.equal(pages[0][0].viewCount, 9007199254740993n);
    assert.equal(pages[0][0].publishedAt.toISOString(), '2026-10-07T01:30:00.000Z');
    assert.equal(pages[0][0].description, 'description');
    assert.equal(calls.filter(url => url.pathname.endsWith('playlistItems')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = key;
  }
});

test('API quota failure is visible and never treated as an empty success', async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = 'test-key';
  globalThis.fetch = async () => Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
  try {
    await assert.rejects(async () => { for await (const page of fetchVideoPages('channel')) void page; }, /hạn mức/);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = key;
  }
});
