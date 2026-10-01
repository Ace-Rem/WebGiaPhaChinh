import { REMOTE_CONFIG } from './remote-config.js';

function joinUrl(path) {
  const base = String(REMOTE_CONFIG.apiBaseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('remote-not-configured');
  return `${base}/${String(path || '').replace(/^\//, '')}`;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REMOTE_CONFIG.requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function authHeaders(token, extra = {}) {
  const value = String(token || '').trim();
  if (!value) throw new Error('publish-token-required');
  return { ...extra, Authorization: `Bearer ${value}` };
}

async function responseError(response, fallback = 'remote-request-failed') {
  let detail = '';
  try { detail = (await response.json())?.error || ''; } catch { /* plain error response */ }
  const error = new Error(detail || fallback);
  error.status = response.status;
  return error;
}

async function sha256Hex(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateEncryptedPayload(encryptedText) {
  if (typeof encryptedText !== 'string' || !encryptedText.trim()) throw new Error('data-empty');
  if (new TextEncoder().encode(encryptedText).byteLength > REMOTE_CONFIG.maxEncryptedBytes) throw new Error('data-too-large');
  let envelope;
  try { envelope = JSON.parse(encryptedText); } catch { throw new Error('data-invalid'); }
  if (!envelope || envelope.v !== 1 || envelope.algorithm !== 'AES-GCM' || !envelope.salt || !envelope.iv || !envelope.ciphertext) throw new Error('data-invalid');
}

export async function publishEncryptedData(encryptedText, token) {
  if (!REMOTE_CONFIG.enabled) throw new Error('remote-disabled');
  validateEncryptedPayload(encryptedText);
  const contentHash = await sha256Hex(encryptedText);
  const response = await request(joinUrl(REMOTE_CONFIG.publishDataPath), {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'text/plain;charset=UTF-8', 'X-Data-Version': contentHash }),
    body: encryptedText,
  });
  if (!response.ok) throw await responseError(response);
  const result = await response.json();
  return { ...result, version: result.version || contentHash, contentHash, dataSize: new TextEncoder().encode(encryptedText).byteLength };
}

async function imageExistsWithHash(filename, contentHash, size) {
  try {
    const response = await request(`${joinUrl(REMOTE_CONFIG.imagePath)}/${encodeURIComponent(filename)}`, { method: 'HEAD', cache: 'no-cache' });
    return response.ok && response.headers.get('X-Content-SHA256') === contentHash && Number(response.headers.get('Content-Length')) === size;
  } catch {
    return false;
  }
}

export async function uploadImageIfChanged(file, token, version) {
  if (!(file instanceof File)) throw new Error('image-invalid');
  if (file.size > REMOTE_CONFIG.maxImageBytes) throw new Error(`image-too-large:${file.name}`);
  const filename = file.name.trim().toLowerCase();
  if (!/^[a-z0-9]+\d{4}\.(?:webp|jpg|jpeg|png)$/.test(filename)) throw new Error(`image-name-invalid:${file.name}`);
  const contentHash = await sha256Hex(file);
  if (await imageExistsWithHash(filename, contentHash, file.size)) return { filename, skipped: true };
  const response = await request(`${joinUrl(REMOTE_CONFIG.publishImagesPath)}/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': file.type || 'application/octet-stream', 'X-Publish-Version': version, 'X-Content-SHA256': contentHash }),
    body: file,
  });
  if (!response.ok) throw await responseError(response, `image-upload-failed:${filename}`);
  return { ...(await response.json()), filename, skipped: false };
}

export async function commitOnlinePublish({ token, version, contentHash, dataSize, images = [] }) {
  const response = await request(joinUrl(REMOTE_CONFIG.publishCommitPath), {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ version, contentHash, dataSize, images }),
  });
  if (!response.ok) throw await responseError(response, 'publish-commit-failed');
  return response.json();
}

export async function publishFamilyData({ encryptedText, token, imageFiles = [] }) {
  const uploadedData = await publishEncryptedData(encryptedText, token);
  const version = uploadedData.version || uploadedData.contentHash;
  const imageResults = [];
  for (const file of imageFiles) imageResults.push(await uploadImageIfChanged(file, token, version));
  const committed = await commitOnlinePublish({ token, version, contentHash: uploadedData.contentHash, dataSize: uploadedData.dataSize, images: imageResults.filter((item) => !item.skipped).map((item) => item.filename) });
  return { ...committed, version, contentHash: uploadedData.contentHash, images: imageResults };
}
