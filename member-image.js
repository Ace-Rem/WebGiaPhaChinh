import { REMOTE_CONFIG } from './remote-config.js';

let imageSource = 'local-fallback';
let imageVersion = null;
const pendingImagePaths = new Map();

function stripVietnameseMarks(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function getMemberImageFilename(member) {
  const fullName = typeof member?.fullName === 'string' ? member.fullName.trim() : '';
  const birthYear = typeof member?.birthDate === 'string' ? member.birthDate.match(/^(\d{4})(?:-|$)/)?.[1] : null;
  if (!fullName || !birthYear) return null;
  const normalizedName = stripVietnameseMarks(fullName).toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
  return normalizedName ? `${normalizedName}${birthYear}.webp` : null;
}

export function getMemberImagePath(member) {
  const filename = getMemberImageFilename(member);
  if (!filename) return null;
  if (pendingImagePaths.has(member?.id)) return pendingImagePaths.get(member.id);
  if (imageSource === 'online' && REMOTE_CONFIG.enabled && REMOTE_CONFIG.apiBaseUrl) {
    const base = `${REMOTE_CONFIG.apiBaseUrl.replace(/\/$/, '')}/${REMOTE_CONFIG.imagePath.replace(/^\//, '')}/${encodeURIComponent(filename)}`;
    return imageVersion ? `${base}?version=${encodeURIComponent(imageVersion)}` : base;
  }
  return `./assets/members/${filename}`;
}

export function setMemberImageSource(source, version = null) {
  imageSource = source === 'online' ? 'online' : 'local-fallback';
  imageVersion = typeof version === 'string' ? version : null;
}

export function setMemberImagePreview(memberId, path) {
  if (!memberId) return;
  pendingImagePaths.set(memberId, path || null);
}

export function clearMemberImagePreview(memberId) {
  pendingImagePaths.delete(memberId);
}

export function clearMemberImagePreviews() {
  pendingImagePaths.clear();
}
