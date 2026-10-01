// Public configuration only. Never put a publish token or Cloudflare credentials here.
export const REMOTE_CONFIG = Object.freeze({
  enabled: true,
  apiBaseUrl: 'https://YOUR-WORKER.workers.dev',
  dataPath: '/data',
  versionPath: '/version',
  publishPath: '/publish',
  publishDataPath: '/publish/data',
  publishImagesPath: '/publish/images',
  publishCommitPath: '/publish/commit',
  imagePath: '/images',
  requestTimeoutMs: 8000,
  maxEncryptedBytes: 20 * 1024 * 1024,
  maxImageBytes: 12 * 1024 * 1024,
});
