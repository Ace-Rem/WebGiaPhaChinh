export function convertGoogleDriveLink(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !['drive.google.com', 'www.drive.google.com'].includes(hostname)) return null;

  const match = url.pathname.match(/^\/file\/d\/([^/]+)\/view\/?$/);
  const fileId = match?.[1] || '';
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) return null;

  return 'https://drive.google.com/uc?export=download&id=' + fileId;
}
