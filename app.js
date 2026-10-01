import { buildFamilyGraph, getSiblingOrder, lifeDates, initials, normalizeText, TreeRenderer } from './tree.js';
import { convertGoogleDriveLink } from './drive-link.js';
import { clearMemberImagePreview, clearMemberImagePreviews, getMemberImageFilename, getMemberImagePath, setMemberImagePreview, setMemberImageSource } from './member-image.js';
import { decryptData, encryptData } from './crypto.js';
import { decryptPreparedData, EDITOR_DATA_SOURCE, loadRemoteVersion, prepareLatestData, publishFamilyData } from './dataSource.js';
import { validateFamily } from './validation.js';
import { analyzeScript, formatScriptDiagnostics } from './script.js';
import { formatImageSize, prepareMemberImage } from './image-processing.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = (name) => `<svg class="icon"><use href="#i-${name}"></use></svg>`;
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const today = () => new Date().toISOString().slice(0, 10);
const makeId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const draftStorageKey = 'family-tree-editor-draft-v1';
const recoveryStorageKey = 'family-tree-editor-recovery-v1';
const viewerUsername = 'donghothe';

const sampleData = {
  schemaVersion: 1,
  family: { name: 'Gia phả họ Nguyễn', description: 'Lưu giữ những câu chuyện và mối liên kết qua các thế hệ.', rootPersonId: 'p004' },
  members: [
    { id: 'p001', fullName: 'Nguyễn Văn Lâm', gender: 'male', birthDate: '1925-03-14', deathDate: '2005-08-21', birthPlace: 'Nam Định', occupation: 'Thợ mộc', fatherId: null, motherId: null, spouseIds: ['p002'], note: 'Người đặt nền móng cho gia đình.' },
    { id: 'p002', fullName: 'Trần Thị Mai', gender: 'female', birthDate: '1928-06-09', deathDate: '2012-02-11', birthPlace: 'Nam Định', occupation: 'Giáo viên', fatherId: null, motherId: null, spouseIds: ['p001'], note: '' },
    { id: 'p003', fullName: 'Nguyễn Văn An', gender: 'male', birthDate: '1954-01-18', deathDate: null, birthPlace: 'Hà Nội', occupation: 'Kỹ sư', fatherId: 'p001', motherId: 'p002', spouseIds: ['p005'], siblingOrder: 1, note: '' },
    { id: 'p005', fullName: 'Phạm Thị Lan', gender: 'female', birthDate: '1958-10-02', deathDate: null, birthPlace: 'Hải Phòng', occupation: 'Bác sĩ', fatherId: null, motherId: null, spouseIds: ['p003'], note: '' },
    { id: 'p004', fullName: 'Nguyễn Minh Khôi', gender: 'male', birthDate: '1984-11-28', deathDate: null, birthPlace: 'Hà Nội', occupation: 'Kiến trúc sư', fatherId: 'p003', motherId: null, spouseIds: ['p006'], siblingOrder: 1, note: 'Người lưu giữ gia phả.' },
    { id: 'p006', fullName: 'Lê Thu Hà', gender: 'female', birthDate: '1987-05-12', deathDate: null, birthPlace: 'Huế', occupation: 'Biên tập viên', fatherId: null, motherId: null, spouseIds: ['p004'], note: '' },
    { id: 'p007', fullName: 'Nguyễn Gia Minh', gender: 'male', birthDate: '2015-04-20', deathDate: null, birthPlace: 'Hà Nội', occupation: 'Học sinh', fatherId: 'p004', motherId: 'p006', spouseIds: [], siblingOrder: 1, note: '' },
    { id: 'p008', fullName: 'Nguyễn An Nhiên', gender: 'female', birthDate: '2018-09-01', deathDate: null, birthPlace: 'Hà Nội', occupation: 'Học sinh', fatherId: 'p004', motherId: 'p006', spouseIds: [], siblingOrder: 2, note: '' },
  ],
};

const els = {
  brandName: $('#brandName'), saveStatus: $('#saveStatus'), memberSummary: $('#memberSummary'), memberSidebar: $('#memberSidebar'), clearMemberSearch: $('#clearMemberSearch'), memberList: $('#memberList'), memberSearch: $('#memberSearch'), listCount: $('#listCount'), sortMembers: $('#sortMembers'), validationBadge: $('#validationBadge'), validationSummary: $('#validationSummary'), validationDialog: $('#validationDialog'), validationContent: $('#validationContent'), driveLinkButton: $('#driveLinkButton'), driveLinkDialog: $('#driveLinkDialog'), driveLinkInput: $('#driveLinkInput'), driveLinkOutput: $('#driveLinkOutput'), driveLinkError: $('#driveLinkError'), copyDriveLinkButton: $('#copyDriveLinkButton'), copyDriveLinkLabel: $('#copyDriveLinkLabel'), scriptButton: $('#scriptButton'), clearMembersButton: $('#clearMembersButton'), scriptDialog: $('#scriptDialog'), scriptInput: $('#scriptInput'), scriptCheck: $('#scriptCheck'), scriptRun: $('#scriptRun'), scriptClear: $('#scriptClear'), scriptHelp: $('#scriptHelp'), scriptStatus: $('#scriptStatus'), scriptHelpDialog: $('#scriptHelpDialog'), detailSidebar: $('#detailSidebar'), familyTitle: $('#familyTitle'), familyDescription: $('#familyDescription'), editFamilyNameButton: $('#editFamilyNameButton'), treeContext: $('#treeContext'), pushGenerationButton: $('#pushGenerationButton'), clearSelection: $('#clearSelection'), treeViewport: $('#treeViewport'), treeSvg: $('#familyTree'), treeLoading: $('#treeLoading'), undoButton: $('#undoButton'), redoButton: $('#redoButton'), generationRail: $('#generationRail'), editorDialog: $('#editorDialog'), memberForm: $('#memberForm'), formKicker: $('#formKicker'), formTitle: $('#formTitle'), formError: $('#formError'), formImagePreview: $('#formImagePreview'), relationshipDialog: $('#relationshipDialog'), relationshipForm: $('#relationshipForm'), relationshipTitle: $('#relationshipTitle'), relationSearch: $('#relationSearch'), relationshipOptions: $('#relationshipOptions'), relationshipTarget: $('#relationshipTarget'), confirmRelationship: $('#confirmRelationship'), settingsDialog: $('#settingsDialog'), settingsForm: $('#settingsForm'), settingsKicker: $('#settingsKicker'), settingsTitle: $('#settingsTitle'), rootPersonSelect: $('#rootPersonSelect'), exportDialog: $('#exportDialog'), passwordDialog: $('#passwordDialog'), passwordForm: $('#passwordForm'), passwordError: $('#passwordError'), publishOnlineButton: $('#publishOnlineButton'), publishDialog: $('#publishDialog'), publishForm: $('#publishForm'), publishError: $('#publishError'), publishProgress: $('#publishProgress'), publishSubmitButton: $('#publishSubmitButton'), initialSyncDialog: $('#initialSyncDialog'), initialSyncForm: $('#initialSyncForm'), initialSyncStatus: $('#initialSyncStatus'), initialSyncVersion: $('#initialSyncVersion'), initialSyncPassword: $('#initialSyncPassword'), initialSyncError: $('#initialSyncError'), initialSyncSubmitButton: $('#initialSyncSubmitButton'), initialDraftButton: $('#initialDraftButton'), initialSampleButton: $('#initialSampleButton'), importFile: $('#importFile'), memberImageInput: $('#memberImageInput'), saveDraftButton: $('#saveDraftButton'), toast: $('#toast')
};
let data = clone(sampleData); let driveCopyTimer; let graph; let renderer; let selectedPersonId = null; let profilePersonId = null; let activeGeneration = null; let editingId = null; let relationType = null; let relationSelectedIds = new Set(); let past = []; let future = []; let dirty = false; let toastTimer; let settingsNameOnly = false; let scriptSeedLoaded = false; let publishTokenSession = '';
let editorState = 'initialLoading'; let pendingStartupData = null; let serverDataVersion = null; let loadedDataVersion = null; let loadedDataSource = null; let preserveRecoveryOnce = false; let startupLocalWork = null; let imageTargetMemberId = null;
const pendingImageChanges = new Map();
const pendingImageDeletes = new Set();

function normaliseData(candidate) {
  const next = clone(candidate || {});
  next.schemaVersion = Number(next.schemaVersion || 1);
  const storedOffset = Number(next.family?.generationOffset); const generationOffset = Number.isFinite(storedOffset) && storedOffset >= 0 ? Math.floor(storedOffset) : 0;
  next.family = { name: next.family?.name || 'Gia phả gia đình', description: next.family?.description || '', rootPersonId: next.family?.rootPersonId || null, generationOffset };
  next.auth = { ...(next.auth && typeof next.auth === 'object' ? next.auth : {}), username: viewerUsername };
  next.members = Array.isArray(next.members) ? next.members.map((member) => ({ id: member?.id || makeId(), fullName: member?.fullName || '', gender: member?.gender || 'unknown', birthDate: member?.birthDate || '', deathDate: member?.deathDate || null, birthPlace: member?.birthPlace || '', occupation: member?.occupation || '', generation: member?.generation ?? null, familyRole: member?.familyRole || null, fatherId: member?.fatherId || null, motherId: member?.motherId || null, spouseIds: Array.isArray(member?.spouseIds) ? [...member.spouseIds] : [], siblingOrder: member?.siblingOrder ?? null, siblingIds: Array.isArray(member?.siblingIds) ? [...member.siblingIds] : [], note: member?.note || '' })) : [];
  return next;
}
function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('is-visible'); toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 3200); }
function resetDriveLinkCopyLabel() {
  clearTimeout(driveCopyTimer);
  els.copyDriveLinkLabel.textContent = 'Sao chép';
}

function updateDriveLinkConversion() {
  const result = convertGoogleDriveLink(els.driveLinkInput.value);
  els.driveLinkOutput.textContent = result || '';
  els.copyDriveLinkButton.disabled = !result;
  els.driveLinkError.textContent = result === null ? 'Link Google Drive không hợp lệ' : '';
  resetDriveLinkCopyLabel();
}

function openDriveLinkDialog() {
  els.driveLinkInput.value = '';
  els.driveLinkOutput.textContent = '';
  els.driveLinkError.textContent = '';
  els.copyDriveLinkButton.disabled = true;
  resetDriveLinkCopyLabel();
  els.driveLinkDialog.showModal();
  setTimeout(() => els.driveLinkInput.focus(), 40);
}

async function copyDriveLink() {
  const value = els.driveLinkOutput.textContent.trim();
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const helper = document.createElement('textarea');
      helper.value = value;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      if (!document.execCommand('copy')) throw new Error('copy-failed');
      helper.remove();
    }
    els.copyDriveLinkLabel.textContent = 'Đã sao chép';
    clearTimeout(driveCopyTimer);
    driveCopyTimer = setTimeout(resetDriveLinkCopyLabel, 1800);
    showToast('Đã sao chép link tải trực tiếp.');
  } catch {
    showToast('Không thể sao chép link. Hãy chọn và copy thủ công.');
  }
}
function member(id) { return data?.members.find((item) => item.id === id); }
function parsePositiveInteger(value) { const raw = String(value ?? '').trim(); if (!raw) return null; const number = Number(raw); return Number.isInteger(number) && number > 0 ? number : NaN; }
function parseSiblingOrder(value) { return parsePositiveInteger(value); }
function pushGenerationsAfter(threshold, excludedId = null) { const currentGraph = buildFamilyGraph(data); data.members.forEach((candidate) => { if (candidate.id === excludedId) return; const currentGeneration = currentGraph.generations.get(candidate.id); if (currentGeneration !== undefined && currentGeneration + 1 >= threshold) candidate.generation = currentGeneration + 2; }); }
function sexLabel(value) { return value === 'male' ? 'Nam' : value === 'female' ? 'Nữ' : 'Chưa xác định'; }
function generationOffset() { return Number.isInteger(data?.family?.generationOffset) && data.family.generationOffset >= 0 ? data.family.generationOffset : 0; }
function displayGeneration(id) { return (graph?.generations.get(id) || 0) + generationOffset() + 1; }
function romanNumeral(number) { const numerals = ['I', 'V', 'X', 'L', 'C', 'D', 'M']; if (number <= 0) return String(number); if (number > 6) return String(number); return number === 1 ? numerals[0] : number === 2 ? 'II' : number === 3 ? 'III' : number === 4 ? 'IV' : number === 5 ? 'V' : 'VI'; }
function captureImageState() {
  return {
    changes: [...pendingImageChanges.entries()].map(([memberId, item]) => ({ memberId, blob: item.blob, width: item.width, height: item.height, size: item.size })),
    deletes: [...pendingImageDeletes],
  };
}
function releasePendingImageUrls() {
  pendingImageChanges.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
}
function restoreImageState(snapshot = {}) {
  releasePendingImageUrls();
  pendingImageChanges.clear();
  pendingImageDeletes.clear();
  clearMemberImagePreviews();
  (snapshot.changes || []).forEach((item) => {
    if (!item?.memberId || !(item.blob instanceof Blob)) return;
    const previewUrl = URL.createObjectURL(item.blob);
    pendingImageChanges.set(item.memberId, { ...item, previewUrl });
    setMemberImagePreview(item.memberId, previewUrl);
  });
  (snapshot.deletes || []).forEach((memberId) => { pendingImageDeletes.add(memberId); setMemberImagePreview(memberId, null); });
}
function captureEditorState() { return { data: clone(data), images: captureImageState() }; }
function restoreEditorState(snapshot) { data = clone(snapshot.data); restoreImageState(snapshot.images); }
function pushHistory() { past.push(captureEditorState()); if (past.length > 80) past.shift(); future = []; dirty = true; }
function clearRecovery() { try { localStorage.removeItem(recoveryStorageKey); } catch {} }
function saveRecoverySnapshot() { try { localStorage.setItem(recoveryStorageKey, JSON.stringify({ savedAt: new Date().toISOString(), data: getExportData() })); } catch {} }
function markSaved(label = 'Đã lưu') { dirty = false; if (preserveRecoveryOnce) preserveRecoveryOnce = false; else clearRecovery(); els.saveStatus.textContent = label; els.saveDraftButton.disabled = true; els.saveDraftButton.setAttribute('aria-disabled', 'true'); document.querySelector('.status-dot')?.classList.remove('is-dirty'); }
function markDirty() { dirty = true; saveRecoverySnapshot(); els.saveDraftButton.disabled = false; els.saveDraftButton.setAttribute('aria-disabled', 'false'); els.saveStatus.textContent = 'Chưa lưu thay đổi'; document.querySelector('.status-dot')?.classList.add('is-dirty'); }
function saveDraft() { try { localStorage.setItem(draftStorageKey, JSON.stringify(getExportData())); markSaved('Đã lưu tạm'); showToast('Đã lưu tạm trong trình duyệt. Chưa xuất file.'); } catch { showToast('Không thể lưu tạm dữ liệu trong trình duyệt này.'); } }
function hasStoredLocalWork() { try { return { draft: Boolean(localStorage.getItem(draftStorageKey)), recovery: Boolean(localStorage.getItem(recoveryStorageKey)) }; } catch { return { draft: false, recovery: false }; } }
function readStoredLocalWork() {
  try {
    const recovery = localStorage.getItem(recoveryStorageKey);
    if (recovery) {
      const stored = JSON.parse(recovery);
      const candidate = normaliseData(stored.data || stored);
      if (candidate.members.length) return candidate;
    }
    const draft = localStorage.getItem(draftStorageKey);
    if (draft) {
      const candidate = normaliseData(JSON.parse(draft));
      if (candidate.members.length) return candidate;
    }
  } catch { /* keep the server/local encrypted source authoritative */ }
  return null;
}
function updateHistoryControls() { [els.undoButton, els.redoButton].forEach((button, index) => { if (!button) return; const enabled = index === 0 ? past.length > 0 : future.length > 0; button.disabled = !enabled; button.setAttribute('aria-disabled', String(!enabled)); }); }
function commit(mutator, message) { pushHistory(); mutator(); refresh(); if (message) showToast(message); }
function currentValidation() { return validateFamily(data); }
function pushAllGenerations() { if (!confirm('Đẩy toàn bộ thế hệ?\n\nThế hệ hiện tại sẽ được dịch lên 1 bậc. Quan hệ cha, mẹ và vợ/chồng không thay đổi.')) return; commit(() => { data.family.generationOffset = generationOffset() + 1; }, `Đã đẩy toàn bộ thế hệ lên ${generationOffset() + 1}.`); }

function avatar(memberData, className = 'avatar') {
  const path = getMemberImagePath(memberData);
  return `<span class="${className}" data-photo-frame data-member-id="${esc(memberData.id || '')}"><span class="avatar-fallback">${esc(initials(memberData.fullName))}</span>${path ? `<img src="${esc(path)}" alt="" data-member-photo loading="lazy" />` : ''}</span>`;
}
function wirePhotos(root = document) { root.querySelectorAll('[data-member-photo]').forEach((image) => { image.addEventListener('load', () => image.closest('[data-photo-frame]')?.classList.add('has-photo'), { once: true }); image.addEventListener('error', () => image.remove(), { once: true }); }); }
function imageStatus(memberData) {
  const filename = getMemberImageFilename(memberData);
  const pending = pendingImageChanges.get(memberData.id);
  if (pending) return { filename, text: `Ảnh chưa đồng bộ · WebP • ${formatImageSize(pending.size)}`, action: 'remove' };
  if (pendingImageDeletes.has(memberData.id)) return { filename, text: 'Ảnh sẽ xóa khi cập nhật Online', action: 'restore' };
  return { filename, text: filename ? 'Ảnh thành viên' : 'Thêm năm sinh để xác định filename', action: filename ? 'remove' : null };
}
function profileImageBlock(memberData) {
  const state = imageStatus(memberData);
  const removeLabel = state.action === 'restore' ? 'Khôi phục ảnh' : 'Xóa ảnh';
  return `<div class="member-photo-panel"><div class="member-photo-frame">${avatar(memberData, 'detail-avatar')}</div><div class="member-photo-copy"><span class="eyebrow">ẢNH THÀNH VIÊN</span><strong>${esc(state.filename || 'Chưa xác định')}</strong><small>${esc(state.text)}</small><div class="member-photo-actions"><button class="button button-quiet" type="button" id="editMemberImage">✎ Sửa ảnh</button>${state.action ? `<button class="text-button member-remove-image" type="button" id="removeMemberImage">${removeLabel}</button>` : ''}</div></div></div>`;
}
function openMemberImagePicker(memberId) {
  imageTargetMemberId = memberId;
  els.memberImageInput.value = '';
  els.memberImageInput.click();
}
function replacePendingImage(memberId, prepared) {
  const previous = pendingImageChanges.get(memberId);
  if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
  const previewUrl = URL.createObjectURL(prepared.blob);
  pendingImageChanges.set(memberId, { ...prepared, previewUrl });
  pendingImageDeletes.delete(memberId);
  setMemberImagePreview(memberId, previewUrl);
}
async function handleMemberImageSelection() {
  const file = els.memberImageInput.files?.[0];
  const memberData = member(imageTargetMemberId);
  if (!file || !memberData) return;
  if (!getMemberImageFilename(memberData)) { showToast('Cần có họ tên và năm sinh để xác định filename ảnh.'); return; }
  try {
    const prepared = await prepareMemberImage(file);
    pushHistory();
    replacePendingImage(memberData.id, prepared);
    refresh();
    showToast(`Đã chuẩn bị ảnh WebP cho ${memberData.fullName}. Chưa upload lên Online.`);
  } catch (error) {
    const messages = { 'image-type-invalid': 'Chỉ hỗ trợ PNG, JPG, JPEG hoặc WebP.', 'image-source-too-large': 'Ảnh gốc vượt quá giới hạn 50 MB.', 'image-decode-failed': 'Không thể đọc ảnh.', 'webp-encode-failed': 'Trình duyệt không thể tạo ảnh WebP.', 'image-output-too-large': 'Ảnh sau tối ưu vẫn vượt quá giới hạn cho phép.' };
    showToast(messages[error?.message] || 'Không thể xử lý ảnh.');
  } finally {
    els.memberImageInput.value = '';
  }
}
function removeMemberImage(memberId) {
  const memberData = member(memberId); if (!memberData) return;
  const isRestore = pendingImageDeletes.has(memberId);
  if (!isRestore && !confirm(`Xóa ảnh của ${memberData.fullName}? Ảnh chỉ bị xóa khi Cập nhật Online thành công.`)) return;
  pushHistory();
  const previous = pendingImageChanges.get(memberId);
  if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
  pendingImageChanges.delete(memberId);
  if (isRestore) {
    pendingImageDeletes.delete(memberId);
    clearMemberImagePreview(memberId);
  } else {
    pendingImageDeletes.add(memberId);
    setMemberImagePreview(memberId, null);
  }
  refresh();
  showToast(isRestore ? 'Đã khôi phục trạng thái ảnh.' : 'Đã đánh dấu xóa ảnh. Chưa xóa trên Online.');
}
function clearPendingImages() {
  releasePendingImageUrls();
  pendingImageChanges.clear();
  pendingImageDeletes.clear();
  clearMemberImagePreviews();
}
function discardPendingImage(memberId) {
  const pending = pendingImageChanges.get(memberId);
  if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
  pendingImageChanges.delete(memberId);
  pendingImageDeletes.delete(memberId);
  clearMemberImagePreview(memberId);
}
function collectPendingImages() {
  const imageChanges = [];
  const removedImages = [];
  const filenames = new Set();
  for (const [memberId, image] of pendingImageChanges) {
    const item = member(memberId);
    const filename = item && getMemberImageFilename(item);
    if (!filename) throw new Error(`image-name-invalid:${item?.fullName || memberId}`);
    if (filenames.has(filename)) throw new Error(`image-name-collision:${filename}`);
    filenames.add(filename);
    imageChanges.push({ filename, blob: image.blob });
  }
  for (const memberId of pendingImageDeletes) {
    const item = member(memberId);
    const filename = item && getMemberImageFilename(item);
    if (filename && !filenames.has(filename)) removedImages.push(filename);
  }
  return { imageChanges, removedImages };
}
function orderedMembers() {
  const query = normalizeText(els.memberSearch.value); let members = graph.members.filter((item) => !query || normalizeText(`${item.fullName} ${item.occupation || ''}`).includes(query));
  const sort = els.sortMembers.value;
  members.sort((a, b) => sort === 'birth' ? String(a.birthDate || '9999').localeCompare(String(b.birthDate || '9999')) : sort === 'generation' ? (graph.generations.get(a.id) - graph.generations.get(b.id)) || a.fullName.localeCompare(b.fullName, 'vi') : a.fullName.localeCompare(b.fullName, 'vi'));
  return members;
}
function renderMemberList() {
  if (els.clearMemberSearch) els.clearMemberSearch.hidden = !els.memberSearch.value;
  const members = orderedMembers(); els.listCount.textContent = `${members.length} / ${graph.members.length} thành viên`; els.memberList.innerHTML = members.map((item) => `<button class="member-row ${item.id === selectedPersonId ? 'selected' : ''}" data-member-id="${esc(item.id)}"><span>${avatar(item, 'list-avatar')}</span><span class="member-row-copy"><strong>${esc(item.fullName || 'Chưa đặt tên')}</strong><small>${esc(lifeDates(item))} · Thế hệ ${displayGeneration(item.id)}</small></span>${item.id === data.family.rootPersonId ? '<i class="root-tag">Gốc</i>' : ''}${icon('arrow')}</button>`).join('') || '<div class="list-empty">Không có thành viên phù hợp.</div>';
  $$('.member-row', els.memberList).forEach((button) => button.addEventListener('click', () => { selectPerson(button.dataset.memberId); closeSidebar(); })); wirePhotos(els.memberList);
}
function relationButton(id, label, removeKind = '') { const item = member(id); return item ? `<div class="relative-wrap"><button class="relative-row" data-relative-id="${esc(id)}"><span>${avatar(item, 'relation-avatar')}</span><span><strong>${esc(item.fullName)}</strong><small>${esc(label)} · ${esc(lifeDates(item))}</small></span>${icon('arrow')}</button>${removeKind ? `<button class="relation-remove" data-remove-kind="${removeKind}" data-remove-id="${esc(id)}" aria-label="Gỡ quan hệ">×</button>` : ''}</div>` : ''; }
function detailRelationBlock(label, ids, sublabel, removeKind = '') { const available = ids.filter((id) => member(id)); return available.length ? `<section class="detail-block"><h3>${label}</h3>${available.map((id) => relationButton(id, sublabel, removeKind)).join('')}</section>` : ''; }
function renderDetail(id = profilePersonId) {
  const item = member(id);
  if (!item) { els.detailSidebar.innerHTML = '<div class="empty-detail"><div class="empty-detail-mark">✦</div><span class="eyebrow">HỒ SƠ THÀNH VIÊN</span><h2>Chọn một người<br />trên cây gia phả</h2><p>Nhấn đúp để xem hồ sơ · dùng nút Chỉnh sửa để chỉnh sửa</p></div>'; return; }
  profilePersonId = id;
  const parents = [item.fatherId, item.motherId].filter(Boolean);
  const children = graph.childrenByParent.get(id) || [];
  const spouseIds = (item.spouseIds || []).filter((spouseId) => member(spouseId));
  const siblingIds = [...(graph.siblingsByMember?.get(id) || [])].filter((siblingId) => member(siblingId));
  els.detailSidebar.innerHTML = `<div class="detail-head"><span class="eyebrow">HỒ SƠ THÀNH VIÊN</span><button class="icon-button" id="closeDetail" aria-label="Đóng hồ sơ"><svg><use href="#i-close"/></svg></button></div>${profileImageBlock(item)}<div class="detail-identity"><h2>${esc(item.fullName || 'Chưa đặt tên')}</h2><p>${esc(lifeDates(item))} · ${esc(sexLabel(item.gender))}</p></div><div class="detail-actions"><button class="button button-primary" id="editDetail">Chỉnh sửa</button><button class="button button-danger" id="deleteDetail">${icon('trash')}<span>Xóa</span></button></div><div class="facts-grid"><div><small>Ngày sinh</small><strong>${esc(formatDateForInput(item.birthDate) || 'Chưa cập nhật')}</strong></div><div><small>Ngày mất</small><strong>${esc(formatDateForInput(item.deathDate) || '—')}</strong></div><div><small>Thế hệ</small><strong>${displayGeneration(id)}</strong></div><div><small>Nơi sinh</small><strong>${esc(item.birthPlace || 'Chưa cập nhật')}</strong></div><div><small>Nghề nghiệp</small><strong>${esc(item.occupation || 'Chưa cập nhật')}</strong></div><div><small>Thứ tự con</small><strong>${getSiblingOrder(item) ?? 'Chưa cập nhật'}</strong></div></div>${detailRelationBlock('Cha mẹ', parents, 'Cha / mẹ', 'parent')}${detailRelationBlock('Vợ / chồng', spouseIds, 'Vợ / chồng', 'spouse')}${siblingIds.length ? `<section class="detail-block"><h3>Anh / chị / em ruột</h3>${siblingIds.map((siblingId) => relationButton(siblingId, 'Anh / chị / em ruột', (item.siblingIds || []).includes(siblingId) ? 'sibling' : '')).join('')}</section>` : ''}<section class="detail-block"><div class="block-heading"><h3>Con cái</h3><button class="mini-add" data-relation="child">＋ Thêm</button></div>${children.length ? children.map((childId) => relationButton(childId, 'Con cái', 'child')).join('') : '<p class="muted">Chưa có con được kết nối.</p>'}</section><section class="detail-block"><div class="block-heading"><h3>Kết nối</h3></div><div class="relation-tools"><button data-relation="father">＋ Thêm cha</button><button data-relation="mother">＋ Thêm mẹ</button><button data-relation="spouse">＋ Vợ / chồng</button><button data-relation="sibling">＋ Anh / chị / em</button></div></section>${item.note ? `<section class="detail-block"><h3>Ghi chú</h3><p class="detail-note">${esc(item.note)}</p></section>` : ''}`;
  wirePhotos(els.detailSidebar);
  $('#closeDetail')?.addEventListener('click', () => { profilePersonId = null; selectedPersonId = null; refreshSelection(); renderDetail(null); });
  $('#editDetail')?.addEventListener('click', () => openMemberEditor(id));
  $('#deleteDetail')?.addEventListener('click', () => deleteMember(id));
  $('#editMemberImage')?.addEventListener('click', () => openMemberImagePicker(id));
  $('#removeMemberImage')?.addEventListener('click', () => removeMemberImage(id));
  $$('.relative-row', els.detailSidebar).forEach((button) => button.addEventListener('click', () => selectPerson(button.dataset.relativeId)));
  $$('.relation-remove', els.detailSidebar).forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); removeRelation(button.dataset.removeKind, button.dataset.removeId); }));
  $$('.mini-add, .relation-tools button', els.detailSidebar).forEach((button) => button.addEventListener('click', () => openRelationship(button.dataset.relation)));
}
function refreshSelection() { renderer?.updateFocus(selectedPersonId, null); $$('.member-row').forEach((row) => row.classList.toggle('selected', row.dataset.memberId === selectedPersonId)); els.clearSelection.hidden = !selectedPersonId; els.treeContext.textContent = selectedPersonId ? `Đang xem ${member(selectedPersonId)?.fullName || 'thành viên'}` : 'Toàn bộ gia phả'; }
function selectPerson(id, { center = true } = {}) { if (!member(id)) return; selectedPersonId = id; profilePersonId = id; renderer?.centerOn(id, center); refreshSelection(); renderDetail(id); }

function renderGenerationRail() { const track = $('.generation-rail-track', els.generationRail); track.innerHTML = Array.from({ length: graph.maxGeneration + 1 }, (_, generation) => `<button data-generation="${generation}" aria-label="Thế hệ ${generationOffset() + generation + 1}"><span>THẾ HỆ ${romanNumeral(generationOffset() + generation + 1)}</span></button>`).join(''); $$('button', track).forEach((button) => button.addEventListener('click', () => { activeGeneration = Number(button.dataset.generation); renderer?.focusGeneration(activeGeneration); updateRail(); })); updateRail(); }
function updateRail() { if (!renderer) return; const metrics = renderer.getGenerationRailMetrics(); const track = $('.generation-rail-track', els.generationRail); track.style.height = `${metrics.trackHeight}px`; metrics.positions.forEach(({ generation, top, height }) => { const button = track.querySelector(`[data-generation="${generation}"]`); if (button) { button.style.top = `${top}px`; button.style.height = `${Math.max(46, Math.min(78, height + 24))}px`; button.classList.toggle('active', activeGeneration === generation); } }); }
function renderValidation() { const result = currentValidation(); const state = result.errors.length ? 'error' : result.warnings.length ? 'warning' : 'ok'; els.validationBadge.textContent = state === 'error' ? '!' : state === 'warning' ? '!' : '✓'; els.validationBadge.className = state; els.validationSummary.textContent = result.errors.length ? `${result.errors.length} lỗi cần xử lý` : result.warnings.length ? `${result.warnings.length} cảnh báo` : 'Dữ liệu hợp lệ'; els.validationContent.innerHTML = `<div class="validation-overview ${state}"><strong>${state === 'error' ? 'Không thể xuất' : state === 'warning' ? 'Có cảnh báo cần xem lại' : 'Dữ liệu sẵn sàng'}</strong><span>${result.memberCount} thành viên · ${result.imageCount} filename ảnh hợp lệ</span></div><div class="validation-section"><h3>QUAN HỆ VÀ DỮ LIỆU</h3>${result.errors.length ? result.errors.map((message) => `<p class="validation-item error"><b>✕</b>${esc(message)}</p>`).join('') : '<p class="validation-item ok"><b>✓</b>Relationships và cấu trúc cơ bản hợp lệ.</p>'}${result.warnings.map((message) => `<p class="validation-item warning"><b>⚠</b>${esc(message)}</p>`).join('')}</div><div class="validation-section"><h3>IMAGE REFERENCES</h3><p class="validation-item ok"><b>✓</b>${result.imageCount} filename được tạo từ họ tên + năm sinh.</p></div>`; return result; }

function setEditorState(state) {
  editorState = state;
  if (state === 'initialLoading') els.saveStatus.textContent = 'Đang kiểm tra dữ liệu Online…';
  if (state === 'loaded') els.saveStatus.textContent = 'Đã tải dữ liệu';
  if (state === 'editing') els.saveStatus.textContent = 'Đã tải dữ liệu';
  if (state === 'publishing') els.saveStatus.textContent = 'Đang cập nhật Online…';
  if (state === 'publishSuccess') els.saveStatus.textContent = 'Đã cập nhật online';
  if (state === 'publishError') els.saveStatus.textContent = 'Online chưa cập nhật';
}

function normaliseAndValidateLoadedData(candidate) {
  const normalised = normaliseData(candidate);
  const validation = validateFamily(normalised);
  if (validation.errors.length) throw new Error(validation.errors.join(' '));
  return normalised;
}

function startEditorUi() {
  renderer = new TreeRenderer(els.treeSvg, els.treeViewport, (id) => selectPerson(id), (id) => selectPerson(id), updateRail);
  renderer.render(buildFamilyGraph(data));
  refresh();
  requestAnimationFrame(() => {
    renderer.fit(false);
    els.treeLoading.classList.add('is-done');
    if (startupLocalWork?.draft || startupLocalWork?.recovery) showToast('Đã tải dữ liệu server. Bản local chưa lưu không tự động được áp dụng.');
  });
}

function applyStartupData(candidate, prepared) {
  data = normaliseData(candidate);
  restoreImageState();
  past = [];
  future = [];
  dirty = false;
  loadedDataSource = prepared.source;
  serverDataVersion = prepared.version?.versionId || null;
  loadedDataVersion = serverDataVersion;
  setMemberImageSource(prepared.source === EDITOR_DATA_SOURCE.ONLINE ? 'online' : 'local-fallback', loadedDataVersion);
  preserveRecoveryOnce = Boolean(startupLocalWork?.recovery);
  setEditorState('loaded');
  startEditorUi();
  setEditorState('editing');
  els.saveStatus.textContent = prepared.source === EDITOR_DATA_SOURCE.ONLINE ? `Đã tải online · ${loadedDataVersion}` : 'Dữ liệu local · chưa phải bản mới nhất';
}

function showStartupPasswordStep() {
  const usingLocal = pendingStartupData.source === EDITOR_DATA_SOURCE.LOCAL_FALLBACK;
  els.initialSyncStatus.textContent = usingLocal ? 'Không thể tải dữ liệu Online. Đang sử dụng dữ liệu local.' : 'Đã tải dữ liệu mới nhất. Nhập mật khẩu Viewer để mở Editor.';
  els.initialSyncVersion.textContent = pendingStartupData.version?.versionId ? `Server version: ${pendingStartupData.version.versionId}` : 'Nguồn: data.enc local (fallback)';
  els.initialSyncPassword.hidden = false;
  els.initialSyncSubmitButton.hidden = false;
  els.initialSyncPassword.querySelector('input')?.focus();
}

async function handleInitialSync(event) {
  event.preventDefault();
  const password = String(new FormData(els.initialSyncForm).get('password') || '');
  if (!password) { els.initialSyncError.textContent = 'Hãy nhập mật khẩu Viewer để giải mã data.enc.'; return; }
  setEditorState('initialLoading');
  els.initialSyncError.textContent = '';
  els.initialSyncStatus.textContent = 'Đang giải mã và kiểm tra dữ liệu…';
  els.initialSyncSubmitButton.disabled = true;
  try {
    const candidate = await decryptPreparedData(pendingStartupData, password, normaliseAndValidateLoadedData);
    applyStartupData(candidate, pendingStartupData);
    els.initialSyncDialog.close();
  } catch (error) {
    setEditorState('initialError');
    els.initialSyncError.textContent = error?.code === 'decrypt-failed' ? 'Mật khẩu Viewer không đúng hoặc data.enc không thể giải mã.' : error?.code === 'schema-invalid' ? 'Dữ liệu tải về không hợp lệ, Editor không thay đổi state.' : 'Không thể mở dữ liệu khởi động.';
  } finally {
    els.initialSyncSubmitButton.disabled = false;
  }
}

function startWithSampleData() {
  applyStartupData(clone(sampleData), { source: 'sample', version: null });
  els.initialSyncDialog.close();
  showToast('Đang dùng dữ liệu mẫu. Hãy nhập hoặc tải data.enc trước khi publish.');
}

function restoreStoredLocalWork() {
  const candidate = readStoredLocalWork();
  if (!candidate) { els.initialSyncError.textContent = 'Bản local không còn hợp lệ.'; return; }
  data = candidate;
  restoreImageState();
  past = [];
  future = [];
  dirty = true;
  // This is an explicit user choice, but the draft has no trustworthy remote
  // version baseline. Keep the publish guard active so it cannot silently
  // overwrite a newer R2 dataset.
  loadedDataSource = EDITOR_DATA_SOURCE.LOCAL_FALLBACK;
  preserveRecoveryOnce = false;
  setEditorState('editing');
  startEditorUi();
  els.initialSyncDialog.close();
  showToast('Đã khôi phục bản local chưa lưu. Dữ liệu server vẫn là version baseline để kiểm tra publish.');
}

async function loadStartupData() {
  startupLocalWork = hasStoredLocalWork();
  setEditorState('initialLoading');
  els.initialSyncDialog.showModal();
  els.initialSyncStatus.textContent = 'Đang kiểm tra dữ liệu Online…';
  els.initialSyncVersion.textContent = '';
  els.initialSyncPassword.hidden = true;
  els.initialSyncSubmitButton.hidden = true;
  els.initialDraftButton.hidden = !startupLocalWork?.draft && !startupLocalWork?.recovery;
  els.initialSampleButton.hidden = true;
  els.initialSyncError.textContent = '';
  try {
    pendingStartupData = await prepareLatestData();
    showStartupPasswordStep();
  } catch (error) {
    setEditorState('initialError');
    els.initialSyncStatus.textContent = 'Không thể tải dữ liệu Online hoặc data.enc local.';
    els.initialSyncVersion.textContent = 'Bạn có thể bắt đầu bằng dữ liệu mẫu, hoặc kiểm tra lại kết nối/file data.enc.';
    els.initialSyncError.textContent = 'Dữ liệu mẫu chỉ được dùng khi bạn chủ động chọn, không tự động ghi đè dữ liệu server.';
    els.initialDraftButton.hidden = !startupLocalWork?.draft && !startupLocalWork?.recovery;
    els.initialSampleButton.hidden = false;
    console.error('Editor startup data unavailable:', error);
  }
}

function refresh() { data = normaliseData(data); graph = buildFamilyGraph(data); els.brandName.textContent = data.family.name; els.familyTitle.textContent = data.family.name || 'Gốc rễ của chúng ta'; els.familyDescription.textContent = data.family.description || 'Mỗi cái tên là một sợi dây nối các thế hệ.'; els.memberSummary.textContent = `${graph.members.length} thành viên · ${graph.maxGeneration + 1} thế hệ`; if (els.clearMembersButton) { els.clearMembersButton.disabled = graph.members.length === 0; els.clearMembersButton.setAttribute('aria-disabled', String(graph.members.length === 0)); } renderer?.render(graph, selectedPersonId); renderMemberList(); renderGenerationRail(); refreshSelection(); renderDetail(profilePersonId); renderValidation(); updateHistoryControls(); if (dirty) markDirty(); else markSaved(); }
function getExportData() { const output = clone(data); output.schemaVersion = 1; output.auth = { ...(data.auth || {}), username: viewerUsername }; return output; }
function download(filename, content, type = 'application/json') { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function exportJson() { const result = renderValidation(); if (result.errors.length) { els.exportDialog.close(); els.validationDialog.showModal(); return; } if (!confirm('File JSON chứa dữ liệu gia phả dạng plaintext. Chỉ dùng làm bản sao lưu an toàn, không đưa trực tiếp lên GitHub Pages public repository. Tiếp tục?')) return; download(`family-backup-${today()}.json`, JSON.stringify(getExportData(), null, 2)); markSaved(); showToast('Đã xuất family.json.'); els.exportDialog.close(); }
async function exportEncrypted() { const result = renderValidation(); if (result.errors.length) { els.exportDialog.close(); els.validationDialog.showModal(); return; } els.exportDialog.close(); els.passwordForm.reset(); els.passwordError.textContent = ''; els.passwordDialog.showModal(); }
async function handlePassword(event) { event.preventDefault(); const form = new FormData(els.passwordForm); const password = form.get('password'); const confirmPassword = form.get('confirmPassword'); if (password.length < 8 || password !== confirmPassword) { els.passwordError.textContent = password.length < 8 ? 'Mật khẩu cần ít nhất 8 ký tự.' : 'Mật khẩu nhập lại chưa khớp.'; return; } try { const encrypted = await encryptData(getExportData(), password); download(`family-data-${today()}.enc`, encrypted, 'text/plain'); els.passwordDialog.close(); markSaved(); showToast('Đã xuất data.enc bằng AES-GCM.'); } catch { els.passwordError.textContent = 'Không thể mã hóa dữ liệu trong trình duyệt này.'; } }
function openPublishDialog() {
  els.publishForm.reset();
  els.publishError.textContent = '';
  els.publishProgress.textContent = '';
  if (publishTokenSession) {
    els.publishForm.elements.publishToken.value = publishTokenSession;
    els.publishForm.elements.rememberToken.checked = true;
  }
  els.publishDialog.showModal();
  setTimeout(() => els.publishForm.elements.publishToken.focus(), 40);
}
function publishErrorMessage(error) {
  if (error?.code === 'worker-http' && (error.status === 401 || error.status === 403)) return 'Publish Token không đúng hoặc không có quyền cập nhật.';
  if (error?.code === 'worker-http' && error.status === 409) return `Worker chưa sẵn sàng commit phiên bản này: ${error.message}.`;
  if (error?.code === 'worker-http') return `Worker từ chối publish (HTTP ${error.status}). Dữ liệu local vẫn an toàn.`;
  if (error?.code === 'remote-version-changed') return `Dữ liệu trên máy chủ đã đổi sang ${error.latestVersion}. Dữ liệu đang chỉnh sửa vẫn được giữ nguyên; hãy tải lại Editor trước khi publish.`;
  if (error?.code === 'remote-version-check-failed') return 'Không thể kiểm tra version mới nhất trước khi publish. Dữ liệu local vẫn an toàn.';
  if (error?.code === 'local-fallback-publish-cancelled') return 'Đã hủy publish để tránh ghi đè dữ liệu Online bằng bản local cũ.';
  if (error?.message === 'remote-not-configured' || error?.message === 'remote-disabled') return 'Chưa cấu hình Worker trong remote-config.js.';
  if (error?.message?.startsWith('image-name-invalid:')) return `Tên ảnh không đúng quy tắc: ${error.message.slice('image-name-invalid:'.length)}`;
  if (error?.message?.startsWith('image-name-collision:')) return `Trùng filename ảnh: ${error.message.slice('image-name-collision:'.length)}`;
  if (error?.message?.startsWith('image-too-large:')) return `Ảnh vượt quá kích thước cho phép: ${error.message.slice('image-too-large:'.length)}`;
  if (error?.code === 'publish-timeout') return 'Worker phản hồi quá thời gian. Dữ liệu local vẫn an toàn.';
  if (error?.code === 'publish-network-or-cors') return 'Không thể kết nối Worker hoặc request bị CORS chặn. Dữ liệu local vẫn an toàn.';
  if (error?.message === 'data-invalid' || error?.message === 'data-empty') return 'data.enc không hợp lệ nên chưa upload. Dữ liệu local vẫn an toàn.';
  return `Không thể cập nhật online${error?.message ? `: ${error.message}` : ''}. Dữ liệu local vẫn an toàn.`;
}
async function ensureCurrentServerVersion() {
  let latest;
  try { latest = await loadRemoteVersion(); } catch (error) { throw Object.assign(new Error('remote-version-check-failed'), { code: 'remote-version-check-failed', cause: error }); }
  serverDataVersion = latest.versionId;
  if (loadedDataVersion && latest.versionId !== loadedDataVersion) {
    throw Object.assign(new Error('remote-version-changed'), { code: 'remote-version-changed', latestVersion: latest.versionId, loadedVersion: loadedDataVersion });
  }
  if (!loadedDataVersion && loadedDataSource === EDITOR_DATA_SOURCE.LOCAL_FALLBACK && !confirm('Editor đang dùng data.enc local vì lần khởi động trước không tải được Worker. Publish có thể ghi đè dữ liệu Online hiện tại. Bạn có chắc muốn tiếp tục?')) {
    throw Object.assign(new Error('local-fallback-publish-cancelled'), { code: 'local-fallback-publish-cancelled' });
  }
  return latest;
}
async function handlePublish(event) {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { els.publishDialog.close(); return; }
  const validation = renderValidation();
  if (validation.errors.length) { els.publishDialog.close(); els.validationDialog.showModal(); return; }
  const form = new FormData(els.publishForm);
  const token = String(form.get('publishToken') || '').trim();
  const password = String(form.get('password') || '');
  if (!token) { els.publishError.textContent = 'Hãy nhập Publish Token.'; return; }
  if (password.length < 8) { els.publishError.textContent = 'Mật khẩu cần ít nhất 8 ký tự.'; return; }
  let pendingImages;
  try { pendingImages = collectPendingImages(); } catch (error) {
    els.publishError.textContent = error?.message?.startsWith('image-name-collision:') ? `Trùng filename ảnh: ${error.message.slice('image-name-collision:'.length)}` : 'Không thể xác định filename ảnh. Hãy bổ sung họ tên và năm sinh.';
    return;
  }
  els.publishSubmitButton.disabled = true;
  els.publishError.textContent = '';
  els.publishProgress.textContent = 'Đang validate và mã hóa data.enc…';
  setEditorState('publishing');
  try {
    await ensureCurrentServerVersion();
    const encryptedText = await encryptData(getExportData(), password);
    const imageCount = pendingImages.imageChanges.length;
    els.publishProgress.textContent = imageCount ? `Đang upload data.enc và ${imageCount} ảnh…` : 'Đang upload data.enc…';
    const result = await publishFamilyData({ encryptedText, token, imageChanges: pendingImages.imageChanges, removedImages: pendingImages.removedImages, onImageProgress: (completed, total) => { els.publishProgress.textContent = `Đã upload ${completed}/${total} ảnh…`; } });
    if (form.get('rememberToken') === 'on') publishTokenSession = token;
    serverDataVersion = result.version;
    loadedDataVersion = result.version;
    setMemberImageSource('online', result.version);
    clearPendingImages();
    refresh();
    markSaved('Đã cập nhật online');
    setEditorState('publishSuccess');
    els.publishProgress.textContent = `Đã cập nhật phiên bản ${result.version}.`;
    els.saveStatus.textContent = 'Đã cập nhật online · hãy export data.enc cho Git';
    els.publishDialog.close();
    showToast('Đã cập nhật Online. Bản local vẫn được giữ nguyên.');
  } catch (error) {
    setEditorState('publishError');
    console.error('Online publish failed:', error);
    els.publishError.textContent = publishErrorMessage(error);
    els.publishProgress.textContent = '';
  } finally {
    els.publishSubmitButton.disabled = false;
  }
}
async function importFile(file) { const text = await file.text(); let imported; if (file.name.toLowerCase().endsWith('.enc')) { const password = prompt('Nhập mật khẩu để mở data.enc:'); if (!password) return; try { imported = await decryptData(text, password); } catch { showToast('Mật khẩu sai hoặc file data.enc không hợp lệ.'); return; } } else { try { imported = JSON.parse(text); } catch { showToast('File JSON không hợp lệ.'); return; } } const candidate = normaliseData(imported); const result = validateFamily(candidate); clearPendingImages(); data = candidate; localStorage.removeItem(draftStorageKey); clearRecovery(); selectedPersonId = null; profilePersonId = null; past = []; future = []; dirty = false; refresh(); if (result.errors.length) { els.validationDialog.showModal(); showToast(`Đã nhập dữ liệu với ${result.errors.length} lỗi cần xử lý.`); } else showToast(`Đã nhập ${candidate.members.length} thành viên.`); }
const starterScript = `# Ví dụ tối thiểu
p A "Nguyễn Văn A" {
  g: m
}

# Có thể khai báo quan hệ trước hoặc sau member
# p B "Nguyễn Văn B" { f: A o: 1 }`;

function renderScriptAnalysis(result) {
  const diagnostics = formatScriptDiagnostics(result);
  const hasErrors = (result.diagnostics || []).length > 0;
  const state = hasErrors ? 'error' : result.ok ? 'success' : 'error';
  els.scriptStatus.className = `script-status ${state}`;
  if (hasErrors) {
    els.scriptStatus.innerHTML = `<strong>Script có lỗi · chưa áp dụng</strong>${diagnostics.map((item) => `<span class="script-message error"><b>${esc(item.type)}</b>${esc(item.text)}${item.hint ? `<small>${esc(item.hint)}</small>` : ''}</span>`).join('')}`;
    return;
  }
  const summary = result.summary;
  const summaryText = summary ? `+ ${summary.created} thành viên mới · ~ ${summary.updated} cập nhật · + ${summary.relations} quan hệ · − ${summary.deleted} thành viên` : 'Không có thay đổi.';
  els.scriptStatus.innerHTML = `<strong>✓ Script hợp lệ</strong><span>${esc(summaryText)}</span>${diagnostics.filter((item) => item.type === 'WARNING').map((item) => `<span class="script-message warning"><b>WARNING</b>${esc(item.text)}</span>`).join('')}`;
}
function openScriptEditor() {
  if (!scriptSeedLoaded && !els.scriptInput.value.trim()) { els.scriptInput.value = starterScript; scriptSeedLoaded = true; }
  els.scriptDialog.showModal();
  setTimeout(() => els.scriptInput.focus(), 40);
}
function checkScript() {
  const result = analyzeScript(els.scriptInput.value, data, makeId);
  renderScriptAnalysis(result);
  return result;
}
function runScript() {
  const result = analyzeScript(els.scriptInput.value, data, makeId);
  renderScriptAnalysis(result);
  if (!result.ok) { showToast('Script có lỗi. Chưa có thay đổi nào được áp dụng.'); return; }
  const summary = result.summary;
  commit(() => { data = result.candidate; }, `Đã chạy script: thêm ${summary.created}, cập nhật ${summary.updated}.`);
  const focusId = result.focusId;
  els.scriptDialog.close();
  if (focusId && member(focusId)) { selectedPersonId = focusId; profilePersonId = focusId; selectPerson(focusId); }
  else showToast('Đã chạy script và cập nhật gia phả.');
}

function openMemberEditor(id = null) {
  editingId = id;
  const stored = id ? member(id) : null;
  const item = stored ? { ...stored, generation: Number.isInteger(stored.generation) && stored.generation > 0 ? stored.generation : (graph.generations.get(id) ?? 0) + 1 } : { fullName: '', gender: 'unknown', birthDate: '', deathDate: '', birthPlace: '', occupation: '', generation: null, familyRole: null, siblingOrder: null, note: '' };
  els.memberForm.reset();
  Object.entries(item).forEach(([key, value]) => { const field = els.memberForm.elements[key]; if (field && key !== 'id' && key !== 'fatherId' && key !== 'motherId' && key !== 'spouseIds') field.value = ['birthDate', 'deathDate'].includes(key) ? formatDateForInput(value) : value ?? ''; });
  els.formKicker.textContent = id ? 'CHỈNH SỬA HỒ SƠ' : 'THÀNH VIÊN MỚI';
  els.formTitle.textContent = id ? 'Chỉnh sửa thành viên' : 'Thêm thành viên';
  els.formError.textContent = '';
  updateFormImage();
  els.editorDialog.showModal();
  setTimeout(() => els.memberForm.elements.fullName.focus(), 40);
}

function formatDateForInput(value) { const raw = String(value ?? '').trim(); const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? match[3] + '-' + match[2] + '-' + match[1] : raw; }
function parseDateInput(value) { const raw = String(value ?? '').trim(); const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/); return match ? match[3] + '-' + match[2] + '-' + match[1] : raw; }
function formatDateInput(event) { const field = event.target; if (!['birthDate', 'deathDate'].includes(field.name)) return; const digits = field.value.replace(/\D/g, '').slice(0, 8); field.value = digits.length > 4 ? digits.slice(0, 2) + '-' + digits.slice(2, 4) + '-' + digits.slice(4) : digits.length > 2 ? digits.slice(0, 2) + '-' + digits.slice(2) : digits; }
function updateFormImage() { const form = new FormData(els.memberForm); const item = { fullName: form.get('fullName'), birthDate: parseDateInput(form.get('birthDate')) }; const filename = getMemberImageFilename(item); els.formImagePreview.innerHTML = filename ? `<span>ẢNH THÀNH VIÊN</span><strong>${esc(filename)}</strong><code>assets/members/${esc(filename)}</code>` : '<span>ẢNH THÀNH VIÊN</span><strong class="muted">Thêm họ tên và năm sinh để tạo filename</strong>'; }
function saveMember(event) {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { els.editorDialog.close(); return; }
  const form = new FormData(els.memberForm);
  const fullName = String(form.get('fullName') || '').trim();
  if (!fullName) { els.formError.textContent = 'Họ và tên là thông tin bắt buộc.'; return; }
  const siblingOrderRaw = String(form.get('siblingOrder') ?? '').trim();
  const siblingOrder = parseSiblingOrder(siblingOrderRaw);
  if (Number.isNaN(siblingOrder)) { els.formError.textContent = 'Thứ tự anh/chị/em phải là số nguyên dương.'; return; }
  const generationRaw = String(form.get('generation') ?? '').trim();
  const generation = parsePositiveInteger(generationRaw);
  if (Number.isNaN(generation)) { els.formError.textContent = 'Thế hệ phải là số nguyên dương.'; return; }
  const pushGeneration = form.get('pushGeneration') === 'on';
  if (pushGeneration && generation === null) { els.formError.textContent = 'Hãy nhập số thế hệ trước khi chọn đẩy thế hệ.'; return; }
  const values = { fullName, gender: form.get('gender') || 'unknown', familyRole: form.get('familyRole') || null, birthDate: parseDateInput(form.get('birthDate')), deathDate: parseDateInput(form.get('deathDate')) || null, birthPlace: String(form.get('birthPlace') || '').trim(), occupation: String(form.get('occupation') || '').trim(), generation, siblingOrder, note: String(form.get('note') || '').trim() };
  const message = pushGeneration ? 'Đã cập nhật hồ sơ và đẩy các thế hệ sau.' : 'Đã cập nhật hồ sơ.';
  if (editingId) commit(() => { if (pushGeneration) pushGenerationsAfter(generation, editingId); Object.assign(member(editingId), values); }, message);
  else {
    const id = makeId();
    commit(() => { if (pushGeneration) pushGenerationsAfter(generation); data.members.push({ id, ...values, fatherId: null, motherId: null, spouseIds: [], siblingIds: [] }); }, pushGeneration ? 'Đã thêm thành viên và đẩy các thế hệ sau.' : 'Đã thêm thành viên.');
    selectedPersonId = id;
    profilePersonId = id;
  }
  els.editorDialog.close();
  refresh();
  selectPerson(editingId || selectedPersonId);
}

function clearAllMembers() {
  const count = data.members.length;
  if (!count) { showToast('Không có thành viên để xóa.'); return; }
  if (!confirm(`Xóa toàn bộ ${count} thành viên?\n\nMọi quan hệ và root person sẽ bị xóa. Thao tác này có thể hoàn tác bằng Undo.`)) return;
  commit(() => {
    const memberIds = data.members.map((item) => item.id);
    data.members = [];
    memberIds.forEach((memberId) => discardPendingImage(memberId));
    data.family.rootPersonId = null;
    selectedPersonId = null;
    profilePersonId = null;
    activeGeneration = null;
  }, `Đã xóa toàn bộ ${count} thành viên.`);
}

function deleteMember(id) { const item = member(id); if (!item) return; const relations = [item.fatherId && `cha: ${member(item.fatherId)?.fullName}`, item.motherId && `mẹ: ${member(item.motherId)?.fullName}`, ...(item.spouseIds || []).map((sid) => `vợ/chồng: ${member(sid)?.fullName}`), ...(graph.childrenByParent.get(id) || []).map((cid) => `con: ${member(cid)?.fullName}`)].filter(Boolean); const detail = relations.length ? `\n\nQuan hệ sẽ được gỡ:\n${relations.join('\n')}` : ''; if (!confirm(`Xóa ${item.fullName}?${detail}\n\nThao tác này có thể hoàn tác.`)) return; commit(() => { data.members = data.members.filter((candidate) => candidate.id !== id); discardPendingImage(id); data.members.forEach((candidate) => { if (candidate.fatherId === id) candidate.fatherId = null; if (candidate.motherId === id) candidate.motherId = null; candidate.spouseIds = (candidate.spouseIds || []).filter((sid) => sid !== id); }); if (data.family.rootPersonId === id) data.family.rootPersonId = null; }, 'Đã xóa thành viên.'); selectedPersonId = null; profilePersonId = null; }
function relationGenerationDelta(type) {
  if (type === 'father' || type === 'mother') return -1;
  if (type === 'child') return 1;
  return 0;
}
function relationGeneration(type) {
  return (graph.generations.get(selectedPersonId) ?? 0) + relationGenerationDelta(type);
}
function relationAlreadyConnected(target, relativeId, type) {
  if (type === 'spouse') return (target.spouseIds || []).includes(relativeId);
  if (type === 'sibling') return graph.siblingsByMember.get(target.id)?.has(relativeId) || (target.siblingIds || []).includes(relativeId);
  if (type === 'child') return (graph.childrenByParent.get(target.id) || []).includes(relativeId);
  return false;
}
function canConnectRelation(target, relative, type) {
  if (!target || !relative || target.id === relative.id) return false;
  if (type === 'sibling' && (graph.familyRoles?.get(target.id) !== 'biological' || graph.familyRoles?.get(relative.id) !== 'biological')) return false;
  if (graph.generations.get(relative.id) !== relationGeneration(type)) return false;
  return !relationAlreadyConnected(target, relative.id, type);
}
function relationGenerationHint(type) {
  const generation = relationGeneration(type) + generationOffset() + 1;
  return generation > 0 ? `Thế hệ ${generation}` : 'thế hệ phù hợp';
}
function openRelationship(type) {
  if (!selectedPersonId) return;
  relationType = type;
  relationSelectedIds = new Set();
  els.relationshipTarget.value = selectedPersonId;
  els.relationSearch.value = "";
  els.relationSearch.placeholder = "Tìm thành viên · " + relationGenerationHint(type);
  els.confirmRelationship.disabled = true;
  els.confirmRelationship.textContent = "Chọn thành viên";
  els.relationshipTitle.textContent = type === "spouse" ? "Thêm vợ / chồng" : type === "sibling" ? "Thêm anh / chị / em ruột" : type === "child" ? "Thêm con" : type === "father" ? "Thêm cha" : type === "mother" ? "Thêm mẹ" : "Thêm cha / mẹ";
  renderRelationshipOptions();
  els.relationshipDialog.showModal();
  setTimeout(() => els.relationSearch.focus(), 40);
}
function renderRelationshipOptions() {
  const target = member(selectedPersonId);
  const q = normalizeText(els.relationSearch.value);
  const options = graph.members.filter((item) => canConnectRelation(target, item, relationType) && (!q || normalizeText(item.fullName + " " + (item.occupation || "")).includes(q))).slice(0, 30);
  const multiSelect = relationType === "child" || relationType === "sibling";
  const emptyMessage = "Không có thành viên phù hợp ở " + relationGenerationHint(relationType) + ".";
  els.relationshipOptions.innerHTML = options.map((item) => {
    const selected = relationSelectedIds.has(item.id);
    return '<button type="button" class="relationship-option ' + (selected ? 'selected' : '') + '" data-relation-id="' + esc(item.id) + '" aria-pressed="' + selected + '">' + avatar(item, "list-avatar") + '<span><strong>' + esc(item.fullName) + '</strong><small>' + esc(lifeDates(item)) + ' · ' + esc(relationGenerationHint(relationType)) + '</small></span>' + (selected ? icon("check") : "") + '</button>';
  }).join("") || '<p class="muted">' + emptyMessage + '</p>';
  wirePhotos(els.relationshipOptions);
  $$(".relationship-option", els.relationshipOptions).forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.relationId;
    if (multiSelect) {
      if (relationSelectedIds.has(id)) relationSelectedIds.delete(id);
      else relationSelectedIds.add(id);
    } else relationSelectedIds = new Set([id]);
    renderRelationshipOptions();
    els.confirmRelationship.disabled = relationSelectedIds.size === 0;
    els.confirmRelationship.textContent = multiSelect && relationSelectedIds.size > 1 ? "Chọn " + relationSelectedIds.size + " thành viên" : "Chọn thành viên";
  }));
}
function removeRelation(kind, relativeId) { const target = member(selectedPersonId); if (!target) return; const relative = member(relativeId); if (!relative || !confirm(`Gỡ quan hệ giữa ${target.fullName} và ${relative.fullName}?`)) return; commit(() => { if (kind === 'spouse') { target.spouseIds = (target.spouseIds || []).filter((id) => id !== relativeId); relative.spouseIds = (relative.spouseIds || []).filter((id) => id !== target.id); } else if (kind === 'child') { if (target.id === relative.fatherId) relative.fatherId = null; if (target.id === relative.motherId) relative.motherId = null; } else if (kind === 'sibling') { target.siblingIds = (target.siblingIds || []).filter((id) => id !== relativeId); relative.siblingIds = (relative.siblingIds || []).filter((id) => id !== target.id); } else { if (target.fatherId === relativeId) target.fatherId = null; if (target.motherId === relativeId) target.motherId = null; } }, 'Đã gỡ quan hệ.'); }
function saveRelationship(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { els.relationshipDialog.close(); return; }
  const target = member(selectedPersonId);
  const relativeIds = [...relationSelectedIds];
  const relatives = relativeIds.map((id) => member(id)).filter(Boolean);
  if (!target || !relatives.length || relatives.length !== relativeIds.length || relatives.some((relative) => !canConnectRelation(target, relative, relationType))) {
    showToast("Chỉ được kết nối với " + relationGenerationHint(relationType) + ".");
    return;
  }
  commit(() => {
    relatives.forEach((relative) => {
      if (relationType === "father") target.fatherId = relative.id;
      else if (relationType === "mother") target.motherId = relative.id;
      else if (relationType === "child") {
        if (target.gender === "female") relative.motherId = target.id;
        else relative.fatherId = target.id;
      } else if (relationType === "sibling") {
        target.siblingIds = [...new Set([...(target.siblingIds || []), relative.id])];
        relative.siblingIds = [...new Set([...(relative.siblingIds || []), target.id])];
      } else {
        target.spouseIds = [...new Set([...(target.spouseIds || []), relative.id])];
        relative.spouseIds = [...new Set([...(relative.spouseIds || []), target.id])];
      }
    });
  }, relatives.length > 1 ? "Đã cập nhật " + relatives.length + " quan hệ." : "Đã cập nhật quan hệ.");
  els.relationshipDialog.close();
}
function openSettings(nameOnly = false) { settingsNameOnly = nameOnly; const form = els.settingsForm; form.elements.familyName.value = data.family.name; form.elements.description.value = data.family.description; els.rootPersonSelect.innerHTML = '<option value="">Chưa chọn</option>' + graph.members.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.fullName) + '</option>').join(''); els.rootPersonSelect.value = data.family.rootPersonId || ''; els.settingsKicker.textContent = nameOnly ? 'ĐỔI TÊN GIA PHẢ' : 'THIẾT LẬP'; els.settingsTitle.textContent = nameOnly ? 'Chỉnh sửa tên gia phả' : 'Thông tin gia đình'; els.settingsDialog.showModal(); setTimeout(() => form.elements.familyName.focus(), 40); }
function saveSettings(event) { event.preventDefault(); if (event.submitter?.value === 'cancel') { els.settingsDialog.close(); settingsNameOnly = false; return; } const form = new FormData(els.settingsForm); commit(() => { data.family.name = String(form.get('familyName') || '').trim() || 'Gia phả gia đình'; data.family.description = String(form.get('description') || '').trim(); data.family.rootPersonId = form.get('rootPersonId') || null; }, settingsNameOnly ? 'Đã cập nhật tên gia phả.' : 'Đã cập nhật thiết lập.'); els.settingsDialog.close(); settingsNameOnly = false; }
function undo() { if (!past.length) return; future.push(captureEditorState()); restoreEditorState(past.pop()); dirty = past.length > 0 || pendingImageChanges.size > 0 || pendingImageDeletes.size > 0; refresh(); showToast('Đã hoàn tác.'); }
function redo() { if (!future.length) return; past.push(captureEditorState()); restoreEditorState(future.pop()); dirty = true; refresh(); showToast('Đã làm lại.'); }
function closeSidebar() { els.memberSidebar.classList.remove('is-open'); }
function init() { loadStartupData(); }

els.driveLinkButton?.addEventListener('click', openDriveLinkDialog); els.driveLinkInput?.addEventListener('input', updateDriveLinkConversion); els.copyDriveLinkButton?.addEventListener('click', copyDriveLink); $('#addMemberButton').addEventListener('click', () => openMemberEditor()); $('#memberSearch').addEventListener('input', renderMemberList); $('#clearMemberSearch').addEventListener('click', () => { els.memberSearch.value = ''; renderMemberList(); els.memberSearch.focus(); }); $('#sortMembers').addEventListener('change', renderMemberList); $('#validationLink').addEventListener('click', () => { renderValidation(); els.validationDialog.showModal(); }); $('#undoButton').addEventListener('click', undo); $('#redoButton').addEventListener('click', redo); els.saveDraftButton?.addEventListener('click', saveDraft); $('#importButton').addEventListener('click', () => els.importFile.click()); els.importFile.addEventListener('change', () => { const file = els.importFile.files[0]; if (file) importFile(file); els.importFile.value = ''; }); els.memberImageInput?.addEventListener('change', handleMemberImageSelection); $('#exportButton').addEventListener('click', () => els.exportDialog.showModal()); $('#pushGenerationButton').addEventListener('click', pushAllGenerations); $('#settingsButton').addEventListener('click', openSettings); els.editFamilyNameButton.addEventListener('click', () => openSettings(true)); $('#openSidebar').addEventListener('click', () => els.memberSidebar.classList.add('is-open')); $('#closeSidebar').addEventListener('click', closeSidebar); $('#clearSelection').addEventListener('click', () => { selectedPersonId = null; profilePersonId = null; activeGeneration = null; renderer?.fit(); refreshSelection(); renderDetail(null); }); $('#zoomInButton').addEventListener('click', () => renderer?.zoomAt(1.18)); $('#zoomOutButton').addEventListener('click', () => renderer?.zoomAt(.84)); $('#fitButton').addEventListener('click', () => { activeGeneration = null; renderer?.fit(); updateRail(); }); els.scriptButton?.addEventListener('click', openScriptEditor); els.clearMembersButton?.addEventListener('click', clearAllMembers); els.scriptCheck?.addEventListener('click', checkScript); els.scriptRun?.addEventListener('click', runScript); els.scriptClear?.addEventListener('click', () => { els.scriptInput.value = ''; scriptSeedLoaded = true; renderScriptAnalysis({ ok: false, diagnostics: [], warnings: [], summary: null }); els.scriptStatus.className = 'script-status'; els.scriptStatus.innerHTML = '<strong>Script đã được xóa</strong><span>Nhập dữ liệu rồi bấm Kiểm tra.</span>'; els.scriptInput.focus(); }); els.scriptHelp?.addEventListener('click', () => els.scriptHelpDialog.showModal()); els.memberForm.addEventListener('submit', saveMember); els.memberForm.addEventListener('input', (event) => { formatDateInput(event); updateFormImage(); }); els.relationshipForm.addEventListener('submit', saveRelationship); els.relationSearch.addEventListener('input', renderRelationshipOptions); els.settingsForm.addEventListener('submit', saveSettings); els.passwordForm.addEventListener('submit', handlePassword); $$('[data-export="json"]').forEach((button) => button.addEventListener('click', exportJson)); $$('[data-export="enc"]').forEach((button) => button.addEventListener('click', exportEncrypted));
els.publishOnlineButton?.addEventListener('click', openPublishDialog); els.publishForm?.addEventListener('submit', handlePublish); els.initialSyncForm?.addEventListener('submit', handleInitialSync); els.initialDraftButton?.addEventListener('click', restoreStoredLocalWork); els.initialSampleButton?.addEventListener('click', startWithSampleData);
const dialogGestureState = new WeakMap();
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('pointerdown', (event) => {
    dialogGestureState.set(dialog, { startedInside: event.target !== dialog });
  });
  dialog.addEventListener('click', (event) => {
    const state = dialogGestureState.get(dialog);
    if (event.target === dialog && !state?.startedInside) dialog.close();
    dialogGestureState.delete(dialog);
  });
});
const persistRecoveryBeforeExit = () => { if (dirty) saveRecoverySnapshot(); };
window.addEventListener('beforeunload', (event) => { if (dirty) { persistRecoveryBeforeExit(); event.preventDefault(); event.returnValue = 'Bạn có thay đổi chưa lưu. Bản recovery đã được tạo.'; } });
window.addEventListener('pagehide', persistRecoveryBeforeExit);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistRecoveryBeforeExit(); }); document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els.memberSearch.focus(); } });
init();
