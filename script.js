import { validateFamily } from './validation.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

class ScriptError extends Error {
  constructor(message, token, hint = '') {
    super(message);
    this.name = 'ScriptError';
    this.line = token?.line || 1;
    this.column = token?.column || 1;
    this.hint = hint;
  }
}

const tokenLabel = (token) => token?.type === 'string' ? `"${token.value}"` : String(token?.value ?? 'cuối script');

function lex(source) {
  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;
  const length = String(source ?? '').length;
  const add = (type, value, startLine, startColumn) => tokens.push({ type, value, line: startLine, column: startColumn });
  const advance = () => {
    const character = source[index++];
    if (character === '\n') { line += 1; column = 1; } else column += 1;
    return character;
  };
  const isIdentifierStart = (character) => /[\p{L}_]/u.test(character);
  const isIdentifierPart = (character) => /[\p{L}\p{N}_-]/u.test(character);
  while (index < length) {
    const character = source[index];
    if (character === ' ' || character === '\t' || character === '\r') { advance(); continue; }
    if (character === '\n') { const l = line; const c = column; advance(); add('newline', '\n', l, c); continue; }
    if (character === '#') { while (index < length && source[index] !== '\n') advance(); continue; }
    const startLine = line;
    const startColumn = column;
    if (character === '"' || character === "'") {
      const quote = advance();
      let value = '';
      let closed = false;
      while (index < length) {
        const next = advance();
        if (next === quote) { closed = true; break; }
        if (next === '\\') {
          if (index >= length) break;
          const escaped = advance();
          value += escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t' : escaped;
        } else value += next;
      }
      if (!closed) throw new ScriptError('Chuỗi chưa đóng dấu nháy.', { line: startLine, column: startColumn }, 'Thêm dấu nháy đóng ở cuối giá trị.');
      add('string', value, startLine, startColumn);
      continue;
    }
    if ('{}:;,'.includes(character)) { advance(); add(character, character, startLine, startColumn); continue; }
    if (/[0-9-]/.test(character)) {
      let value = '';
      while (index < length && /[0-9.-]/.test(source[index])) value += advance();
      add('number', value, startLine, startColumn);
      continue;
    }
    if (isIdentifierStart(character)) {
      let value = '';
      while (index < length && isIdentifierPart(source[index])) value += advance();
      add('identifier', value, startLine, startColumn);
      continue;
    }
    throw new ScriptError(`Ký tự không hợp lệ "${character}".`, { line: startLine, column: startColumn }, 'Chỉ dùng tên, số, chuỗi, dấu hai chấm và dấu ngoặc nhọn.');
  }
  add('eof', '', line, column);
  return tokens;
}

class Parser {
  constructor(source) {
    this.tokens = lex(source);
    this.index = 0;
  }

  current() { return this.tokens[this.index]; }
  previous() { return this.tokens[Math.max(0, this.index - 1)]; }
  take(type = null) {
    const token = this.current();
    if (type && token.type !== type) throw new ScriptError(`Mong đợi ${type} nhưng nhận được ${tokenLabel(token)}.`, token);
    this.index += 1;
    return token;
  }
  is(type, value = null) { return this.current().type === type && (value === null || this.current().value.toLowerCase() === value.toLowerCase()); }
  isIdentifier(...values) { return this.current().type === 'identifier' && (!values.length || values.some((value) => this.current().value.toLowerCase() === value.toLowerCase())); }
  skipSeparators() { while (this.is('newline') || this.is(';') || this.is(',')) this.take(); }
  expectIdentifier(message = 'Mong đợi một alias hoặc tên thuộc tính.') { if (!this.is('identifier')) throw new ScriptError(message, this.current()); return this.take(); }
  expectValue(message = 'Mong đợi một giá trị.') {
    const token = this.current();
    if (!['identifier', 'number', 'string'].includes(token.type)) throw new ScriptError(message, token);
    return this.take();
  }
  expectEnd() {
    if (!(this.is('newline') || this.is(';') || this.is('eof'))) throw new ScriptError(`Không hiểu phần dư "${tokenLabel(this.current())}".`, this.current());
    this.skipSeparators();
  }
  parseBlock() {
    this.take('{');
    const fields = [];
    this.skipSeparators();
    while (!this.is('}') && !this.is('eof')) {
      const key = this.expectIdentifier();
      if (!this.is(':')) throw new ScriptError(`Thuộc tính "${key.value}" phải có dấu ":".`, this.current());
      this.take(':');
      const value = this.expectValue(`Thuộc tính "${key.value}" đang thiếu giá trị.`);
      fields.push({ key: key.value, value: value.value, token: key, valueToken: value });
      this.skipSeparators();
    }
    if (this.is('eof')) throw new ScriptError('Thiếu dấu ngoặc "}" đóng block.', this.current(), 'Kiểm tra lại block gần dòng này.');
    this.take('}');
    return fields;
  }
  parse() {
    const statements = [];
    this.skipSeparators();
    while (!this.is('eof')) {
      const command = this.expectIdentifier('Mong đợi một lệnh như p, update, s hoặc family.');
      const keyword = command.value.toLowerCase();
      if (['p', 'person'].includes(keyword)) {
        const alias = this.expectIdentifier('Lệnh person cần một alias.');
        let name = null;
        if (this.is('string')) name = this.take().value;
        const fields = this.is('{') ? this.parseBlock() : [];
        if (!fields.length && !name) this.expectEnd();
        else if (!this.is('newline') && !this.is(';') && !this.is('eof')) throw new ScriptError('Lệnh person cần block thuộc tính hoặc kết thúc dòng.', this.current());
        this.skipSeparators();
        statements.push({ type: 'person', alias: alias.value, name, fields, token: command });
      } else if (['update', 'edit'].includes(keyword)) {
        const alias = this.expectIdentifier('Lệnh update cần alias người cần sửa.');
        if (!this.is('{')) throw new ScriptError('Lệnh update cần block thuộc tính.', this.current());
        const fields = this.parseBlock();
        this.skipSeparators();
        statements.push({ type: 'update', alias: alias.value, fields, token: command });
      } else if (['s', 'spouse', 'f', 'father', 'm', 'mother', 'child', 'c', 'sib', 'sibling'].includes(keyword)) {
        const left = this.expectIdentifier('Lệnh quan hệ cần alias thứ nhất.');
        const right = this.expectIdentifier('Lệnh quan hệ cần alias thứ hai.');
        this.expectEnd();
        const relation = keyword === 'spouse' || keyword === 's' ? 'spouse' : keyword === 'father' || keyword === 'f' ? 'father' : keyword === 'mother' || keyword === 'm' ? 'mother' : keyword === 'child' || keyword === 'c' ? 'child' : 'sibling';
        statements.push({ type: 'relation', relation, left: left.value, right: right.value, token: command });
      } else if (keyword === 'family') {
        if (!this.is('{')) throw new ScriptError('Lệnh family cần block thuộc tính.', this.current());
        const fields = this.parseBlock();
        this.skipSeparators();
        statements.push({ type: 'family', fields, token: command });
      } else if (['pushgeneration', 'pushgen'].includes(keyword)) {
        this.expectEnd();
        statements.push({ type: 'pushGeneration', token: command });
      } else if (keyword === 'delete') {
        const alias = this.expectIdentifier('Lệnh delete cần alias người cần xóa.');
        this.expectEnd();
        statements.push({ type: 'delete', alias: alias.value, token: command });
      } else {
        throw new ScriptError(`Không nhận diện được lệnh "${command.value}".`, command, 'Dùng p, update, s, f, m, c, sib, family, delete hoặc pushGeneration.');
      }
    }
    return statements;
  }
}

const propertyMap = new Map([
  ['fullname', 'fullName'], ['name', 'fullName'], ['n', 'fullName'], ['familyname', 'fullName'],
  ['gender', 'gender'], ['g', 'gender'], ['generation', 'generation'], ['gen', 'generation'],
  ['familyrole', 'familyRole'], ['lineage', 'familyRole'], ['lineagetype', 'familyRole'], ['role', 'familyRole'], ['inlaw', 'familyRole'],
  ['siblingorder', 'siblingOrder'], ['order', 'siblingOrder'], ['ord', 'siblingOrder'], ['o', 'siblingOrder'],
  ['birthdate', 'birthDate'], ['birth', 'birthDate'], ['dob', 'birthDate'], ['b', 'birthDate'],
  ['deathdate', 'deathDate'], ['death', 'deathDate'], ['dod', 'deathDate'], ['d', 'deathDate'],
  ['birthplace', 'birthPlace'], ['place', 'birthPlace'], ['pl', 'birthPlace'], ['p', 'birthPlace'],
  ['occupation', 'occupation'], ['job', 'occupation'], ['occ', 'occupation'],
  ['note', 'note'], ['nt', 'note'],
  ['f', 'father'], ['father', 'father'], ['m', 'mother'], ['mother', 'mother'],
  ['s', 'spouse'], ['spouse', 'spouse'], ['c', 'child'], ['child', 'child'], ['sib', 'sibling'], ['sibling', 'sibling'],
]);

const normalizeGender = (value) => {
  const normalized = String(value).trim().toLowerCase();
  if (['m', 'male', 'nam'].includes(normalized)) return 'male';
  if (['f', 'female', 'nu', 'nữ'].includes(normalized)) return 'female';
  if (['unknown', 'u', 'unk', 'chua', 'chưa'].includes(normalized)) return 'unknown';
  return null;
};

const normalizeFamilyRole = (value, token) => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (['biological', 'blood', 'child', 'con-ruot', 'conruot', 'ruot', 'false'].includes(normalized)) return 'biological';
  if (['inlaw', 'in-law', 'daughter-in-law', 'son-in-law', 'con-dau', 'con-re', 'true'].includes(normalized)) return 'inLaw';
  throw new ScriptError(`familyRole "${value}" không hợp lệ.`, token, 'Dùng biological hoặc in-law.');
};

function parsePositive(value, token, label) {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new ScriptError(`${label} phải là số nguyên dương.`, token);
  return Number(raw);
}

function parseNonnegative(value, token, label) {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new ScriptError(`${label} phải là số nguyên không âm.`, token);
  return Number(raw);
}

function normalizeDate(value, token, label) {
  const raw = String(value ?? '').trim();
  if (!raw) return label === 'deathDate' ? null : '';
  const display = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (display) return `${display[3]}-${display[2]}-${display[1]}`;
  if (/^\d{4}(?:-\d{2}-\d{2})?$/.test(raw)) return raw;
  throw new ScriptError(`${label} "${raw}" không đúng định dạng. Dùng DD-MM-YYYY.`, token);
}

function diagnostic(error, type = 'ERROR') {
  return { type, line: error.line || 1, column: error.column || 1, message: error.message, hint: error.hint || '' };
}

function memberDefaults(id, fullName = '') {
  return { id, fullName, gender: 'unknown', familyRole: null, birthDate: '', deathDate: null, birthPlace: '', occupation: '', generation: null, fatherId: null, motherId: null, spouseIds: [], siblingOrder: null, siblingIds: [], note: '' };
}

function fieldEntries(fields, allowRelations = true, allowFamily = false) {
  const entries = [];
  for (const field of fields) {
    const key = String(field.key).toLowerCase();
    const property = propertyMap.get(key);
    const familyProperty = ['description', 'root', 'generationoffset'].includes(key) ? key : null;
    if ((!property && !familyProperty) || (!allowRelations && property && ['father', 'mother', 'spouse', 'child', 'sibling'].includes(property)) || (familyProperty && !allowFamily)) throw new ScriptError(`Thuộc tính không hợp lệ "${field.key}".`, field.token);
    entries.push({ ...field, property: property || familyProperty });
  }
  return entries;
}

function relationLabel(relation) {
  return relation === 'father' ? 'father' : relation === 'mother' ? 'mother' : relation === 'spouse' ? 'spouse' : relation === 'child' ? 'child' : 'sibling';
}

function analyzeSemantic(statements, data, makeId) {
  const candidate = clone(data);
  candidate.family = { ...(candidate.family || {}) };
  candidate.members = Array.isArray(candidate.members) ? candidate.members : [];
  const byId = new Map(candidate.members.map((item) => [item.id, item]));
  const symbols = new Map();
  const touchedIds = new Set();
  const createdIds = [];
  const updatedIds = new Set();
  const deletedIds = new Set();
  const relationOps = [];
  const familyRootRefs = [];
  const warnings = [];
  let relationCount = 0;

  const resolve = (alias, token, role) => {
    const symbol = symbols.get(alias);
    if (symbol) return symbol.id;
    if (byId.has(alias)) return alias;
    throw new ScriptError(`Không tìm thấy thành viên "${alias}" được tham chiếu bởi ${role}.`, token, 'Hãy khai báo alias đó trước hoặc sau trong script.');
  };
  const ensureSymbol = (alias, token) => {
    if (symbols.has(alias)) throw new ScriptError(`Alias bị trùng "${alias}".`, token, 'Mỗi alias chỉ được khai báo một lần trong script.');
    const existing = byId.get(alias);
    const symbol = { alias, id: existing?.id || makeId(), existing: Boolean(existing) };
    symbols.set(alias, symbol);
    if (!existing) { const item = memberDefaults(symbol.id); candidate.members.push(item); byId.set(item.id, item); createdIds.push(item.id); }
    touchedIds.add(symbol.id);
    return symbol;
  };
  const getTarget = (alias, token, role = 'member') => {
    const id = resolve(alias, token, role);
    const item = byId.get(id);
    if (!item) throw new ScriptError(`Không tìm thấy member "${alias}".`, token);
    touchedIds.add(id);
    return item;
  };
  const applyScalar = (item, entry) => {
    const { property, value, valueToken } = entry;
    if (property === 'fullName') {
      if (!String(value).trim()) throw new ScriptError('Tên thành viên không được để trống.', valueToken);
      item.fullName = String(value).trim();
    } else if (property === 'gender') {
      const gender = normalizeGender(value);
      if (!gender) throw new ScriptError(`Giới tính "${value}" không hợp lệ.`, valueToken, 'Dùng m/f hoặc male/female.');
      item.gender = gender;
    } else if (property === 'generation') item.generation = parsePositive(value, valueToken, 'generation');
    else if (property === 'familyRole') item.familyRole = normalizeFamilyRole(value, valueToken);
    else if (property === 'siblingOrder') item.siblingOrder = parsePositive(value, valueToken, 'siblingOrder');
    else if (property === 'birthDate' || property === 'deathDate') item[property] = normalizeDate(value, valueToken, property);
    else item[property] = String(value ?? '').trim();
  };
  const addRelation = (relation, leftAlias, rightAlias, token) => {
    const leftId = resolve(leftAlias, token, relationLabel(relation));
    const rightId = resolve(rightAlias, token, relationLabel(relation));
    relationOps.push({ relation, leftId, rightId, token });
    touchedIds.add(leftId); touchedIds.add(rightId); relationCount += 1;
  };

  for (const statement of statements) {
    if (statement.type === 'person') {
      const symbol = ensureSymbol(statement.alias, statement.token);
      const item = byId.get(symbol.id);
      if (statement.name !== null) applyScalar(item, { property: 'fullName', value: statement.name, valueToken: statement.token });
      const fields = fieldEntries(statement.fields);
      for (const entry of fields) {
        if (['father', 'mother', 'spouse', 'child', 'sibling'].includes(entry.property)) {
          relationOps.push({ relation: entry.property, leftId: item.id, rightAlias: String(entry.value), token: entry.valueToken });
          relationCount += 1;
        } else applyScalar(item, entry);
      }
      if (!item.fullName.trim()) throw new ScriptError(`Member "${statement.alias}" chưa có họ tên.`, statement.token, 'Dùng p A "Họ và tên" hoặc n/name trong block.');
      if (symbol.existing) updatedIds.add(item.id);
    } else if (statement.type === 'update') {
      const item = getTarget(statement.alias, statement.token, 'update');
      const fields = fieldEntries(statement.fields);
      for (const entry of fields) {
        if (['father', 'mother', 'spouse', 'child', 'sibling'].includes(entry.property)) {
          relationOps.push({ relation: entry.property, leftId: item.id, rightAlias: String(entry.value), token: entry.valueToken });
          relationCount += 1;
        } else applyScalar(item, entry);
      }
      updatedIds.add(item.id);
    } else if (statement.type === 'relation') {
      relationOps.push({ relation: statement.relation, leftAlias: statement.left, rightAlias: statement.right, token: statement.token });
      relationCount += 1;
    } else if (statement.type === 'delete') {
      const id = resolve(statement.alias, statement.token, 'delete');
      deletedIds.add(id);
    } else if (statement.type === 'pushGeneration') {
      const offset = Number(candidate.family.generationOffset);
      candidate.family.generationOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) + 1 : 1;
    } else if (statement.type === 'family') {
      for (const entry of fieldEntries(statement.fields, false, true)) {
        if (entry.property === 'fullName') candidate.family.name = String(entry.value).trim();
        else if (String(entry.key).toLowerCase() === 'description') candidate.family.description = String(entry.value).trim();
        else if (String(entry.key).toLowerCase() === 'root') familyRootRefs.push(entry);
        else if (String(entry.key).toLowerCase() === 'generationoffset') candidate.family.generationOffset = parseNonnegative(entry.value, entry.valueToken, 'generationOffset');
        else throw new ScriptError(`Thuộc tính family không hợp lệ "${entry.key}".`, entry.token);
      }
    }
  }

  familyRootRefs.forEach((entry) => { candidate.family.rootPersonId = resolve(String(entry.value), entry.valueToken, 'root'); });

  for (const operation of relationOps) {
    const leftId = operation.leftId || resolve(operation.leftAlias, operation.token, relationLabel(operation.relation));
    const rightId = operation.rightId || resolve(operation.rightAlias, operation.token, relationLabel(operation.relation));
    const left = byId.get(leftId); const right = byId.get(rightId);
    if (!left || !right) throw new ScriptError('Quan hệ tham chiếu tới member không tồn tại.', operation.token);
    if (left.id === right.id) throw new ScriptError(`Không thể tạo quan hệ ${relationLabel(operation.relation)} tự tham chiếu.`, operation.token);
    if (operation.relation === 'father') left.fatherId = right.id;
    else if (operation.relation === 'mother') left.motherId = right.id;
    else if (operation.relation === 'child') {
      if (left.gender === 'female') right.motherId = left.id;
      else right.fatherId = left.id;
    } else if (operation.relation === 'spouse') {
      left.spouseIds = [...new Set([...(left.spouseIds || []), right.id])];
      right.spouseIds = [...new Set([...(right.spouseIds || []), left.id])];
    } else {
      left.siblingIds = [...new Set([...(left.siblingIds || []), right.id])];
      right.siblingIds = [...new Set([...(right.siblingIds || []), left.id])];
    }
  }

  if (deletedIds.size) {
    candidate.members = candidate.members.filter((item) => !deletedIds.has(item.id));
    const remaining = new Set(candidate.members.map((item) => item.id));
    candidate.members.forEach((item) => {
      if (deletedIds.has(item.fatherId)) item.fatherId = null;
      if (deletedIds.has(item.motherId)) item.motherId = null;
      item.spouseIds = (item.spouseIds || []).filter((id) => remaining.has(id));
      item.siblingIds = (item.siblingIds || []).filter((id) => remaining.has(id));
    });
    if (deletedIds.has(candidate.family.rootPersonId)) candidate.family.rootPersonId = null;
    deletedIds.forEach((id) => { const item = data.members.find((candidateMember) => candidateMember.id === id); if (item) warnings.push(`Đã xóa "${item.fullName}" và gỡ các tham chiếu liên quan.`); });
  }

  const validation = validateFamily(candidate);
  const errors = [...validation.errors];
  const scriptMembers = candidate.members.filter((item) => touchedIds.has(item.id));
  for (const item of scriptMembers) {
    if (item.fatherId === item.id || item.motherId === item.id) errors.push(`${item.fullName || item.id}: không thể là cha/mẹ của chính mình.`);
    if ((item.fatherId || item.motherId) && item.siblingOrder === null) warnings.push(`${item.fullName || item.id}: chưa có siblingOrder; thứ tự sibling sẽ không được xác định đầy đủ.`);
  }
  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set([...validation.warnings, ...warnings])];
  if (uniqueErrors.length) return { ok: false, candidate: null, diagnostics: uniqueErrors.map((message) => ({ type: 'ERROR', line: 1, column: 1, message, hint: '' })), warnings: uniqueWarnings, summary: null };
  const created = createdIds.filter((id) => !deletedIds.has(id));
  return {
    ok: true,
    candidate,
    diagnostics: [],
    warnings: uniqueWarnings,
    focusId: created[0] || [...updatedIds][0] || null,
    summary: { created: created.length, updated: updatedIds.size, relations: relationCount, deleted: deletedIds.size, warnings: uniqueWarnings.length },
  };
}

export function analyzeScript(source, data, makeId) {
  try {
    if (!String(source ?? '').trim()) return { ok: false, candidate: null, diagnostics: [{ type: 'ERROR', line: 1, column: 1, message: 'Script đang trống.', hint: 'Nhập ít nhất một member, ví dụ: p A "Nguyễn Văn A".' }], warnings: [], summary: null };
    const statements = new Parser(String(source)).parse();
    if (!statements.length) return { ok: false, candidate: null, diagnostics: [{ type: 'ERROR', line: 1, column: 1, message: 'Script không có lệnh nào.', hint: '' }], warnings: [], summary: null };
    return analyzeSemantic(statements, data, makeId);
  } catch (error) {
    return { ok: false, candidate: null, diagnostics: [diagnostic(error)], warnings: [], summary: null };
  }
}

export function formatScriptDiagnostics(analysis) {
  const lines = [];
  (analysis.diagnostics || []).forEach((item) => lines.push({ type: item.type || 'ERROR', text: `Dòng ${item.line}, cột ${item.column}: ${item.message}`, hint: item.hint }));
  (analysis.warnings || []).forEach((message) => lines.push({ type: 'WARNING', text: message, hint: '' }));
  return lines;
}
