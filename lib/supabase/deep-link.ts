export function readAuthCode(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('bpr://auth-callback')) return null;
  try {
    return new URL(url).searchParams.get('code');
  } catch {
    return null;
  }
}
