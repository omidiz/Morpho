/** What the browser offers for sharing. Passed in so the logic can be tested. */
export interface ShareEnv {
  /** navigator.share, where it exists. */
  share?: (data: ShareData) => Promise<void>;
  /** Copy text to the clipboard, where possible. */
  copy?: (text: string) => Promise<void>;
  /** True on phones and tablets, where the system share sheet is the natural choice. */
  preferNativeShare: boolean;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Share `url`: the system share sheet on phones, copy to clipboard elsewhere
 * (or when the share sheet fails). Call it straight from a click handler:
 * browsers only allow sharing in response to a tap or click.
 */
export async function shareLink(url: string, title: string, env: ShareEnv): Promise<ShareResult> {
  if (env.preferNativeShare && env.share) {
    try {
      await env.share({ title, url });
      return 'shared';
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if ((err as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (env.copy) {
    try {
      await env.copy(url);
      return 'copied';
    } catch {
      // fall through
    }
  }
  return 'failed';
}

