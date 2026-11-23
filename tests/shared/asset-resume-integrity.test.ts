// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBuffer } from '../../src/loading';

const enc = new TextEncoder(), dec = new TextDecoder();
type Spec = { status: number; chunk: string; length?: number; range?: string; encoding?: string; fail?: boolean };

// Minimal streaming Response mock. A first read can succeed while a later read
// rejects, exactly as happens when a connection breaks mid-download.
function response({ status, chunk, length, range, encoding, fail }: Spec): Response {
  const headers = new Headers();
  if (length !== undefined) headers.set('content-length', String(length));
  if (range !== undefined) headers.set('content-range', range);
  if (encoding !== undefined) headers.set('content-encoding', encoding);
  return {
    ok: status >= 200 && status < 300, status, headers,
    body: {
      getReader() {
        let calls = 0;
        return {
          async read() {
            if (calls++ === 0) return { done: false, value: enc.encode(chunk) };
            if (fail) throw new TypeError('connection reset after partial body');
            return { done: true, value: undefined };
          },
        };
      },
    },
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('resumable asset integrity', () => {
  it('appends a verified HTTP range only at the exact downloaded byte offset', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(response({ status: 200, chunk: 'abc', length: 10, fail: true }))
      .mockResolvedValueOnce(response({ status: 206, chunk: 'defghij', length: 7, range: 'bytes 3-9/10' }));
    vi.stubGlobal('fetch', mock);
    const result = await fetchBuffer('/models/test.glb', undefined, 1000);
    expect(dec.decode(result)).toBe('abcdefghij');
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[0][1].headers).toBeUndefined();
    expect(mock.mock.calls[1][1].headers).toEqual({ Range: 'bytes=3-' });
  });

  it('restarts from zero rather than silently concatenating a misaligned range', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(response({ status: 200, chunk: 'abc', length: 10, fail: true }))
      .mockResolvedValueOnce(response({ status: 206, chunk: 'abcdefg', length: 7, range: 'bytes 0-6/10' }))
      .mockResolvedValueOnce(response({ status: 200, chunk: 'abcdefghij', length: 10 }));
    vi.stubGlobal('fetch', mock);
    const result = await fetchBuffer('/models/test.glb', undefined, 1000);
    expect(dec.decode(result)).toBe('abcdefghij');
    expect(mock).toHaveBeenCalledTimes(3);
    expect(mock.mock.calls[1][1].headers).toEqual({ Range: 'bytes=3-' });
    expect(mock.mock.calls[2][1].headers).toBeUndefined();
  });

  it('does not trust HTTP 206 without a Content-Range header', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(response({ status: 200, chunk: 'abc', length: 10, fail: true }))
      .mockResolvedValueOnce(response({ status: 206, chunk: 'defghij', length: 7 }))
      .mockResolvedValueOnce(response({ status: 200, chunk: 'abcdefghij', length: 10 }));
    vi.stubGlobal('fetch', mock);
    expect(dec.decode(await fetchBuffer('/models/test.glb'))).toBe('abcdefghij');
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('rejects mismatched range lengths and compressed resumed chunks', async () => {
    for (const invalid of [
      { status: 206, chunk: 'defghij', length: 6, range: 'bytes 3-9/10' },
      { status: 206, chunk: 'defghij', length: 7, range: 'bytes 3-9/10', encoding: 'gzip' },
    ]) {
      const mock = vi.fn()
        .mockResolvedValueOnce(response({ status: 200, chunk: 'abc', length: 10, fail: true }))
        .mockResolvedValueOnce(response(invalid))
        .mockResolvedValueOnce(response({ status: 200, chunk: 'abcdefghij', length: 10 }));
      vi.stubGlobal('fetch', mock);
      expect(dec.decode(await fetchBuffer('/models/test.glb'))).toBe('abcdefghij');
      expect(mock).toHaveBeenCalledTimes(3);
    }
  });

  it('keeps a partially resumed transfer alive until all expected bytes arrive', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(response({ status: 200, chunk: 'abc', length: 10, fail: true }))
      .mockResolvedValueOnce(response({ status: 206, chunk: 'de', range: 'bytes 3-9/10' }))
      .mockResolvedValueOnce(response({ status: 206, chunk: 'fghij', range: 'bytes 5-9/10' }));
    vi.stubGlobal('fetch', mock);
    const result = await fetchBuffer('/models/test.glb', undefined, 1000);
    expect(dec.decode(result)).toBe('abcdefghij');
    expect(mock).toHaveBeenCalledTimes(3);
    expect(mock.mock.calls[2][1].headers).toEqual({ Range: 'bytes=5-' });
  });
});
