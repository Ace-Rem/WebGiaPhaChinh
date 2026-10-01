import { decryptData } from './crypto.js';
import { REMOTE_CONFIG } from './remote-config.js';

export const EDITOR_DATA_SOURCE = Object.freeze({
  ONLINE: 'online',
  LOCAL_FALLBACK: 'local-fallback',
});

function joinUrl(path) {
  const base = String(REMOTE_CONFIG.apiBaseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('remote-not-configured');
  return `${base}/${String(path || '').replace(/^\//, '')}`;
}

function taggedError(code, message = code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function assertVersion(version) {
  if (!version || typeof version !== 'object' || version.schemaVersion !== 1) throw taggedError('remote-version-invalid', 'version-invalid');
  const versionId = version.contentHash || version.dataVersion || version.version;
  if (!versionId || typeof versionId !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(versionId)) throw taggedError('remote-version-invalid', 'version-invalid');
  if (version.updatedAt && Number.isNaN(Date.parse(version.updatedAt))) throw taggedError('remote-version-invalid', 'version-invalid');
  return { ...version, versionId };
}

function assertEncryptedPayload(payload, source = 'remote') {
  if (typeof payload !== 'string' || !payload.trim()) throw taggedError(`${source}-envelope-invalid`, 'data-empty');
  if (new TextEncoder().encode(payload).byteLength > REMOTE_CONFIG.maxEncryptedBytes) throw taggedError(`${source}-envelope-invalid`, 'data-too-large');
  let envelope;
  try { envelope = JSON.parse(payload); } catch { throw taggedError(`${source}-envelope-invalid`, 'data-invalid'); }
  if (!envelope || envelope.v !== 1 || envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' || envelope.iterations !== 210000 || !envelope.salt || !envelope.iv || !envelope.ciphertext) throw taggedError(`${source}-envelope-invalid`, 'data-invalid');
}

async function workerGet(url, phase) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REMOTE_CONFIG.requestTimeoutMs);
  const target = new URL(url);
  console.info(`[Worker] GET ${target.pathname}${target.search}`);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    console.info(`[Worker] status: ${response.status} ${phase}`);
    return response;
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'remote-timeout' : 'remote-fetch';
    console.warn(`[Worker] ${code}:`, error?.message || error);
    throw taggedError(code, code, { cause: error });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadRemoteVersion() {
  if (!REMOTE_CONFIG.enabled) throw taggedError('remote-disabled');
  const response = await workerGet(joinUrl(REMOTE_CONFIG.versionPath), 'GET /version');
  if (!response.ok) throw taggedError('remote-http', `version-http-${response.status}`, { status: response.status });
  let body;
  try { body = await response.json(); } catch (error) { throw taggedError('remote-response-invalid', 'version-response-invalid', { cause: error }); }
  const version = assertVersion(body);
  console.info('[Worker] version:', version.versionId);
  return version;
}

export async function loadRemoteEncryptedData(version) {
  const versionId = typeof version === 'string' ? version : version?.versionId;
  if (!versionId) throw taggedError('remote-version-invalid', 'version-invalid');
  const response = await workerGet(joinUrl(REMOTE_CONFIG.dataPath) + `?version=${encodeURIComponent(versionId)}`, 'GET /data');
  if (!response.ok) throw taggedError('remote-http', `data-http-${response.status}`, { status: response.status });
  const payload = await response.text();
  assertEncryptedPayload(payload, 'remote');
  console.info('[Worker] encrypted data received:', new TextEncoder().encode(payload).byteLength, 'bytes');
  return payload;
}

async function loadLocalEncryptedData() {
  console.info('[Worker] local fallback ./data.enc');
  let response;
  try { response = await fetch('./data.enc', { cache: 'no-store' }); } catch (error) { throw taggedError('local-fetch', 'data-unavailable', { cause: error }); }
  if (!response.ok) throw taggedError('local-fetch', 'data-unavailable', { status: response.status });
  const payload = await response.text();
  assertEncryptedPayload(payload, 'local');
  return payload;
}

export async function prepareLatestData() {
  let remoteError = null;
  if (REMOTE_CONFIG.enabled) {
    try {
      const version = await loadRemoteVersion();
      const payload = await loadRemoteEncryptedData(version);
      return { payload, source: EDITOR_DATA_SOURCE.ONLINE, version };
    } catch (error) {
      remoteError = error;
      console.warn('[Worker] Online startup data unavailable; using local fallback.', error?.code || error?.message || error);
    }
  }
  try {
    const payload = await loadLocalEncryptedData();
    return { payload, source: EDITOR_DATA_SOURCE.LOCAL_FALLBACK, version: null, remoteError };
  } catch (error) {
    error.remoteError = remoteError;
    throw error;
  }
}

export async function decryptPreparedData(prepared, password, normaliseAndValidate) {
  let candidate;
  try { candidate = await decryptData(prepared.payload, password); } catch (error) { throw taggedError('decrypt-failed', 'decrypt-failed', { cause: error }); }
  try { return normaliseAndValidate(candidate); } catch (error) { throw taggedError('schema-invalid', 'data-invalid', { cause: error }); }
}

async function request(url, options = {}, phase = 'request') {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REMOTE_CONFIG.requestTimeoutMs);
  const method = String(options.method || 'GET').toUpperCase();
  const safeUrl = new URL(url);
  console.info(`[Publish] ${phase} ${method} ${safeUrl.pathname}${safeUrl.search}`);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    console.info(`[Publish] status ${response.status} ${phase}`);
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('publish-timeout');
      timeoutError.code = 'publish-timeout';
      timeoutError.phase = phase;
      console.warn(`[Publish] timeout ${phase}`);
      throw timeoutError;
    }
    const networkError = new Error('publish-network-or-cors');
    networkError.code = 'publish-network-or-cors';
    networkError.phase = phase;
    console.warn(`[Publish] network/CORS error ${phase}:`, error?.message || error);
    throw networkError;
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
  error.code = 'worker-http';
  error.status = response.status;
  console.warn(`[Publish] Worker rejected request: HTTP ${response.status}${detail ? ` (${detail})` : ''}`);
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
  if (!envelope || envelope.v !== 1 || envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' || envelope.iterations !== 210000 || !envelope.salt || !envelope.iv || !envelope.ciphertext) throw new Error('data-invalid');
}

export async function publishEncryptedData(encryptedText, token) {
  if (!REMOTE_CONFIG.enabled) throw new Error('remote-disabled');
  validateEncryptedPayload(encryptedText);
  const contentHash = await sha256Hex(encryptedText);
  const response = await request(joinUrl(REMOTE_CONFIG.publishDataPath), {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json', 'X-Data-Version': contentHash }),
    body: encryptedText,
  }, 'upload data');
  if (!response.ok) throw await responseError(response);
  const result = await response.json();
  return { ...result, version: result.version || contentHash, contentHash, dataSize: new TextEncoder().encode(encryptedText).byteLength };
}

async function imageExistsWithHash(filename, contentHash, size) {
  try {
    const response = await request(`${joinUrl(REMOTE_CONFIG.imagePath)}/${encodeURIComponent(filename)}`, { method: 'HEAD', cache: 'no-cache' }, 'check image');
    return response.ok && response.headers.get('X-Content-SHA256') === contentHash && Number(response.headers.get('Content-Length')) === size;
  } catch (error) {
    if (error?.code !== 'publish-network-or-cors') throw error;
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
  }, `upload image ${filename}`);
  if (!response.ok) throw await responseError(response, `image-upload-failed:${filename}`);
  return { ...(await response.json()), filename, skipped: false };
}

export async function commitOnlinePublish({ token, version, contentHash, dataSize, images = [] }) {
  const response = await request(joinUrl(REMOTE_CONFIG.publishCommitPath), {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ version, contentHash, dataSize, images }),
  }, 'commit');
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
