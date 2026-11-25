import { describe, expect, it, vi } from 'vitest';
import { shareLink } from './share';

const url = 'https://omidiz.github.io/morpho/?p=turing&seed=abc';
const abort = () => Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' }));

describe('shareLink', () => {
  it('opens the share sheet on phones', async () => {
    const share = vi.fn(() => Promise.resolve());
    const copy = vi.fn(() => Promise.resolve());
    expect(await shareLink(url, 'Morpho', { share, copy, preferNativeShare: true })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Morpho', url });
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the link elsewhere, even if the share sheet exists', async () => {
    const share = vi.fn(() => Promise.resolve());
    const copy = vi.fn(() => Promise.resolve());
    expect(await shareLink(url, 'Morpho', { share, copy, preferNativeShare: false })).toBe('copied');
    expect(copy).toHaveBeenCalledWith(url);
    expect(share).not.toHaveBeenCalled();
  });

  it('copies on phones without a share sheet', async () => {
    const copy = vi.fn(() => Promise.resolve());
    expect(await shareLink(url, 'Morpho', { copy, preferNativeShare: true })).toBe('copied');
  });

  it('does nothing more when the share sheet is closed', async () => {
    const copy = vi.fn(() => Promise.resolve());
    expect(await shareLink(url, 'Morpho', { share: abort, copy, preferNativeShare: true })).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
  });

  it('falls back to copying when sharing fails', async () => {
    const copy = vi.fn(() => Promise.resolve());
    const share = () => Promise.reject(new Error('NotAllowedError'));
    expect(await shareLink(url, 'Morpho', { share, copy, preferNativeShare: true })).toBe('copied');
  });

  it('reports failure when nothing works', async () => {
    const copy = () => Promise.reject(new Error('denied'));
    expect(await shareLink(url, 'Morpho', { copy, preferNativeShare: false })).toBe('failed');
    expect(await shareLink(url, 'Morpho', { preferNativeShare: false })).toBe('failed');
  });
});
