import { getMemberImageFilename } from './member-image.js';
import { resolveFamilyRoles } from './sibling-role.js';

const validDate = (value) => !value || (typeof value === 'string' && /^\d{4}(?:-\d{2}-\d{2})?$/.test(value) && !Number.isNaN(Date.parse(`${value.length === 4 ? `${value}-01-01` : value}T00:00:00`)));
const validSiblingOrder = (value) => Number.isInteger(value) && value > 0;
const validGeneration = (value) => Number.isInteger(value) && value > 0;
const validFamilyRole = (value) => value === null || value === undefined || value === '' || ['biological', 'inLaw', 'in-law', 'inlaw'].includes(value);

export function validateFamily(data) {
  const errors = [];
  const warnings = [];
  const members = Array.isArray(data?.members) ? data.members : [];
  if (!data || typeof data !== 'object') errors.push('Dữ liệu phải là một object JSON.');
  if (data?.schemaVersion !== 1) warnings.push(`schemaVersion hiện tại là ${data?.schemaVersion ?? 'trống'}; Editor dùng schemaVersion 1.`);
  if (!data?.family || typeof data.family !== 'object') errors.push('Thiếu thông tin family.');
  if (!members.length) errors.push('Gia phả cần ít nhất một thành viên.');
  const ids = new Set();
  const byId = new Map();
  members.forEach((member, index) => {
    if (!member || typeof member !== 'object') { errors.push(`Thành viên thứ ${index + 1} không hợp lệ.`); return; }
    if (typeof member.id !== 'string' || !member.id.trim()) errors.push(`Thành viên thứ ${index + 1} thiếu ID.`);
    else if (ids.has(member.id)) errors.push(`Trùng ID: ${member.id}.`);
    else { ids.add(member.id); byId.set(member.id, member); }
    if (typeof member.fullName !== 'string' || !member.fullName.trim()) errors.push(`Thành viên ${member.id || index + 1} chưa có họ tên.`);
    if (!validDate(member.birthDate)) errors.push(`${member.fullName || member.id}: ngày sinh không hợp lệ.`);
    if (!validDate(member.deathDate)) errors.push(`${member.fullName || member.id}: ngày mất không hợp lệ.`);
    if (member.birthDate && member.deathDate && new Date(member.deathDate) < new Date(member.birthDate)) errors.push(`${member.fullName || member.id}: ngày mất trước ngày sinh.`);
    if (member.fatherId === member.id || member.motherId === member.id) errors.push(`${member.fullName || member.id}: không thể là cha/mẹ của chính mình.`);
    if (!Array.isArray(member.spouseIds)) errors.push(`${member.fullName || member.id}: spouseIds phải là mảng.`);
    if (!Array.isArray(member.siblingIds)) errors.push(`${member.fullName || member.id}: siblingIds phải là mảng.`);
    if (member.siblingOrder !== null && member.siblingOrder !== undefined && !validSiblingOrder(member.siblingOrder)) errors.push(`${member.fullName || member.id}: siblingOrder phải là số nguyên dương.`);
    if (member.generation !== null && member.generation !== undefined && !validGeneration(member.generation)) errors.push(`${member.fullName || member.id}: generation phải là số nguyên dương.`);
    if (!validFamilyRole(member.familyRole)) errors.push(`${member.fullName || member.id}: familyRole không hợp lệ.`);
  });
  members.forEach((member) => {
    if (!member || typeof member !== 'object') return;
    for (const [label, id] of [['cha', member.fatherId], ['mẹ', member.motherId]]) if (id && !ids.has(id)) errors.push(`${member.fullName || member.id}: tham chiếu ${label} không tồn tại.`);
    const spouseIds = Array.isArray(member.spouseIds) ? member.spouseIds : [];
    if (new Set(spouseIds).size !== spouseIds.length) errors.push(`${member.fullName || member.id}: spouseIds bị trùng.`);
    spouseIds.forEach((id) => {
      if (!ids.has(id)) errors.push(`${member.fullName || member.id}: tham chiếu vợ/chồng không tồn tại.`);
      else if (id === member.id) errors.push(`${member.fullName || member.id}: không thể là vợ/chồng của chính mình.`);
      else if (!(byId.get(id).spouseIds || []).includes(member.id)) warnings.push(`Quan hệ vợ/chồng chưa đối xứng: ${member.fullName} · ${byId.get(id).fullName}.`);
    });
    const siblingIds = Array.isArray(member.siblingIds) ? member.siblingIds : [];
    if (new Set(siblingIds).size !== siblingIds.length) errors.push(`${member.fullName || member.id}: siblingIds bị trùng.`);
    siblingIds.forEach((id) => {
      if (!ids.has(id)) errors.push(`${member.fullName || member.id}: tham chiếu anh/chị/em không tồn tại.`);
      else if (id === member.id) errors.push(`${member.fullName || member.id}: không thể là anh/chị/em của chính mình.`);
      else if (!(byId.get(id).siblingIds || []).includes(member.id)) warnings.push(`Quan hệ anh/chị/em chưa đối xứng: ${member.fullName} · ${byId.get(id).fullName}.`);
    });
  });
  const familyRoleResolution = resolveFamilyRoles(members);
  familyRoleResolution.ambiguousIds.forEach((id) => {
    const member = byId.get(id);
    warnings.push(`${member?.fullName || id}: chưa đủ dữ liệu để xác định là con ruột hay con dâu/con rể; không dùng member này để kiểm tra siblingOrder.`);
  });
  const biologicalChildrenByParent = new Map();
  members.forEach((member) => {
    if (!member || typeof member !== 'object' || familyRoleResolution.byId.get(member.id) !== 'biological') return;
    [member.fatherId, member.motherId].filter((parentId) => parentId && ids.has(parentId)).forEach((parentId) => {
      if (!biologicalChildrenByParent.has(parentId)) biologicalChildrenByParent.set(parentId, []);
      biologicalChildrenByParent.get(parentId).push(member.id);
    });
  });
  const duplicateSiblingOrders = new Map();
  biologicalChildrenByParent.forEach((children, parentId) => {
    const orders = new Map();
    children.forEach((childId) => {
      const order = byId.get(childId)?.siblingOrder;
      if (!Number.isInteger(order)) return;
      if (!orders.has(order)) {
        orders.set(order, childId);
        return;
      }
      const firstId = orders.get(order);
      const pair = [firstId, childId].sort().join('|');
      duplicateSiblingOrders.set(`${pair}:${order}`, { order, firstId, secondId: childId, parentId });
    });
  });
  duplicateSiblingOrders.forEach(({ order, firstId, secondId, parentId }) => {
    const first = byId.get(firstId);
    const second = byId.get(secondId);
    const parent = byId.get(parentId);
    errors.push(`Trùng siblingOrder ${order} giữa ${first?.fullName || firstId} và ${second?.fullName || secondId} trong nhóm con ruột của ${parent?.fullName || parentId}.`);
  });
  const visiting = new Set(); const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) { errors.push('Phát hiện vòng lặp trong quan hệ cha/mẹ.'); return; }
    if (visited.has(id)) return;
    visiting.add(id); const member = byId.get(id);
    [member?.fatherId, member?.motherId].filter(Boolean).forEach((parentId) => { if (byId.has(parentId)) visit(parentId); });
    visiting.delete(id); visited.add(id);
  };
  ids.forEach(visit);
  if (data?.family?.rootPersonId && !ids.has(data.family.rootPersonId)) errors.push('Root person không tồn tại trong danh sách thành viên.');
  if (!data?.family?.rootPersonId && members.length) warnings.push('Chưa chọn root person.');
  const imageNames = new Map();
  members.forEach((member) => {
    const filename = getMemberImageFilename(member);
    if (!filename) { warnings.push(`${member.fullName || member.id}: chưa có năm sinh nên chưa thể xác định tên ảnh.`); return; }
    if (imageNames.has(filename)) warnings.push(`Trùng tên file ảnh: ${filename} (${imageNames.get(filename)} · ${member.fullName}).`);
    else imageNames.set(filename, member.fullName);
  });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], memberCount: members.length, imageCount: imageNames.size, imageNames };
}
