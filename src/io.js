import { COLORS, STATUSES, iso, monday, sprintWeeks, validateDocument, itemStats, migrateDocument } from './model.js';
export const COLUMNS = ['Layer', 'Name', 'ID', 'Phase', 'Deliverable', 'Epic', 'Start Date', 'End Date', 'Start Sprint', 'End Sprint', 'Status', 'Color'];
const status = value => {
  const s = String(value ?? '').trim().toLowerCase().replace(/[ -]/g, '_') || 'planned';
  const normalized = { cancel: 'canceled', cancelled: 'canceled', to_do: 'planned', review: 'in_progress' }[s] || s;
  if (!STATUSES.includes(normalized)) throw new Error(`Unsupported status “${value}”. Use planned, in_progress, done or canceled.`);
  return normalized;
};
const text = value => String(value ?? '').trim();
function cellValue(cell) {
  const value = cell.value;
  if (value instanceof Date) return iso(value);
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result instanceof Date ? iso(value.result) : typeof value.result === 'number' && /[dy]/i.test(cell.numFmt || '') ? iso(new Date(Date.UTC(1899, 11, 30) + value.result * 86400000)) : value.result;
    if ('richText' in value) return value.richText.map(v => v.text).join('');
    if ('text' in value) return value.text;
    return '';
  }
  return value ?? '';
}
export function parseCSV(input) {
  const rows = []; let row = [], field = '', quoted = false;
  const str = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') { if (quoted && str[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && str[i + 1] === '\n') i++; row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function rowsToDocument(rows) {
  if (rows.length < 2) throw new Error('The file needs a header and at least one phase.');
  const heads = rows[0].map(h => text(h).toLowerCase());
  if (!heads.includes('deliverable') && !heads.includes('epic')) return legacyRowsToDocument(rows);
  if (heads.filter(Boolean).some((h, i, list) => list.indexOf(h) !== i)) throw new Error('Duplicate column headers are not allowed.');
  for (const h of ['layer', 'name']) if (!heads.includes(h)) throw new Error(`Missing column “${h}”.`);
  const get = (row, key) => row[heads.indexOf(key.toLowerCase())] ?? '';
  const records = rows.slice(1).filter(r => r.some(v => text(v))).map((row, i) => {
    const layer = Number(get(row, 'Layer')), name = text(get(row, 'Name'));
    if (![1, 2, 3, 4].includes(layer)) throw new Error(`Row ${i + 2}: Layer must be 1, 2, 3 or 4.`);
    if (!name) throw new Error(`Row ${i + 2}: Name is required.`);
    return { row, layer, name, id: text(get(row, 'ID')) || crypto.randomUUID(), number: i + 2 };
  });
  const doc = { version: 2, title: 'Imported schedule', phases: [], deliverables: [], epics: [], tasks: [] };
  const resolve = (items, ref, label, number) => {
    const byId = items.filter(x => x.id === text(ref)), matches = byId.length ? byId : items.filter(x => x.name === text(ref));
    if (!text(ref) || matches.length !== 1) throw new Error(`Row ${number}: ${label} must match one parent name or ID within the selected hierarchy. Use IDs for duplicate names.`);
    return matches[0];
  };
  for (const r of records.filter(r => r.layer === 1)) doc.phases.push({ id: r.id, name: r.name, start: text(get(r.row, 'Start Date')), end: text(get(r.row, 'End Date')), color: text(get(r.row, 'Color')) || COLORS[doc.phases.length % COLORS.length] });
  validateDocument(doc);
  const weeks = sprintWeeks(doc.phases);
  const range = r => {
    const a = get(r.row, 'Start Sprint'), b = get(r.row, 'End Sprint');
    if (!text(a) && !text(b)) return { startWeek: null, endWeek: null };
    const start = Number(a), end = Number(text(b) ? b : a);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > weeks.length) throw new Error(`Row ${r.number}: invalid sprint range.`);
    return { startWeek: weeks[start - 1].start, endWeek: weeks[end - 1].start };
  };
  for (const layer of [2, 3, 4]) for (const r of records.filter(r => r.layer === layer)) {
    const p = resolve(doc.phases, get(r.row, 'Phase'), 'Phase', r.number);
    const base = { id: r.id, name: r.name, ...range(r) };
    if (layer === 2) { doc.deliverables.push({ ...base, phaseId: p.id }); continue; }
    const d = resolve(doc.deliverables.filter(x => x.phaseId === p.id), get(r.row, 'Deliverable'), 'Deliverable', r.number);
    if (layer === 3) { doc.epics.push({ ...base, deliverableId: d.id }); continue; }
    const e = resolve(doc.epics.filter(x => x.deliverableId === d.id), get(r.row, 'Epic'), 'Epic', r.number);
    doc.tasks.push({ ...base, epicId: e.id, status: status(get(r.row, 'Status')) });
  }
  return validateDocument(doc);
}
function legacyRowsToDocument(rows) {
  if (rows.length < 2) throw new Error('The file needs a header and at least one phase.');
  const heads = rows[0].map(h => text(h).toLowerCase());
  for (const h of ['layer', 'name']) if (!heads.includes(h)) throw new Error(`Missing column “${h}”. Download the import template for the expected structure.`);
  const get = (row, key) => row[heads.indexOf(key.toLowerCase())] ?? '';
  const records = rows.slice(1).filter(r => r.some(v => text(v))).map((row, i) => {
    const layer = Number(get(row, 'Layer')); if (![1, 2, 3].includes(layer)) throw new Error(`Row ${i + 2}: Layer must be 1, 2 or 3.`);
    const name = text(get(row, 'Name')); if (!name) throw new Error(`Row ${i + 2}: Name is required.`);
    return { row, layer, name, id: text(get(row, 'ID')) || crypto.randomUUID(), number: i + 2 };
  });
  const doc = { version: 1, title: 'Imported schedule', phases: [], epics: [], stories: [] };
  const resolve = (items, ref, label, row) => {
    const byId = items.filter(item => item.id === text(ref));
    const matches = byId.length ? byId : items.filter(item => item.name === text(ref));
    if (!text(ref) || matches.length !== 1) throw new Error(`Row ${row}: ${label} must match one parent name or ID. Use an ID if names are duplicated.`);
    return matches[0];
  };
  for (const r of records.filter(r => r.layer === 1)) doc.phases.push({ id: r.id, name: r.name, start: text(get(r.row, 'Start Date')), end: text(get(r.row, 'End Date')), color: text(get(r.row, 'Color')) || COLORS[doc.phases.length % COLORS.length] });
  validateDocument(migrateDocument(doc));
  const weeks = sprintWeeks(doc.phases);
  const range = r => {
    const a = get(r.row, 'Start Sprint'), b = get(r.row, 'End Sprint');
    if (!text(a) && !text(b)) return { startWeek: null, endWeek: null };
    const start = Number(a), end = Number(b || a);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > weeks.length) throw new Error(`Row ${r.number}: invalid sprint range.`);
    return { startWeek: weeks[start - 1].start, endWeek: weeks[end - 1].start };
  };
  for (const r of records.filter(r => r.layer === 2)) {
    const p = resolve(doc.phases, get(r.row, 'Phase'), 'Phase', r.number);
    doc.epics.push({ id: r.id, name: r.name, phaseId: p.id, ...range(r) });
  }
  for (const r of records.filter(r => r.layer === 3)) {
    const p = resolve(doc.phases, get(r.row, 'Phase'), 'Phase', r.number);
    const e = resolve(doc.epics.filter(e => e.phaseId === p.id), get(r.row, 'Big Task'), 'Big Task', r.number);
    doc.stories.push({ id: r.id, name: r.name, epicId: e.id, status: status(get(r.row, 'Status')), ...range(r) });
  }
  return validateDocument(migrateDocument(doc));
}
function legacyWorkbook(book) {
  const road = book.getWorksheet('Roadmap'), backlog = book.getWorksheet('Backlog'), calendar = book.getWorksheet('Sprint Calendar');
  if (!road || !backlog || !calendar) throw new Error('Use the WBS template or the previously generated four-sheet roadmap.');
  const doc = { version: 1, title: 'Chat feature schedule', phases: [], epics: [], stories: [] };
  road.eachRow(row => {
    const level = cellValue(row.getCell(2)), id = text(cellValue(row.getCell(1)));
    if (level === 1) doc.phases.push({ id: `phase-${id}`, name: text(cellValue(row.getCell(3))), start: text(cellValue(row.getCell(4))), end: text(cellValue(row.getCell(5))), color: COLORS[doc.phases.length % COLORS.length] });
    if (level === 2) doc.epics.push({ id: `epic-${id}`, phaseId: `phase-${id.split('.')[0]}`, name: text(cellValue(row.getCell(3))), startWeek: monday(text(cellValue(row.getCell(4)))), endWeek: monday(text(cellValue(row.getCell(5)))) });
  });
  const weeks = []; for (let i = 7; i <= 36; i++) weeks.push(text(cellValue(calendar.getRow(i).getCell(2))));
  backlog.eachRow((row, n) => {
    if (n < 7) return;
    const id = text(cellValue(row.getCell(1))); if (!id) return;
    const sprint = Number(cellValue(row.getCell(20)));
    doc.stories.push({ id: `story-${id}`, name: text(cellValue(row.getCell(5))), epicId: `epic-${text(cellValue(row.getCell(3)))}`, status: status(cellValue(row.getCell(11))), startWeek: weeks[sprint - 1] || null, endWeek: weeks[sprint - 1] || null });
  });
  return validateDocument(migrateDocument(doc));
}
export async function readImport(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Import files must be 10 MB or smaller.');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'json') {
    const doc = migrateDocument(JSON.parse(await file.text()));
    if (Array.isArray(doc?.tasks)) doc.tasks = doc.tasks.map(t => ({ ...t, status: status(t.status) }));
    if (Array.isArray(doc?.phases)) doc.phases = doc.phases.map((p, i) => ({ ...p, color: p.color || COLORS[i % COLORS.length] }));
    return validateDocument(doc);
  }
  if (ext === 'csv') return rowsToDocument(parseCSV(await file.text()));
  if (ext !== 'xlsx') throw new Error('Choose an .xlsx, .csv or .json WBS file.');
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const bytes = await file.arrayBuffer();
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  let normalized = false;
  // Some valid XLSX writers prefix spreadsheet elements. ExcelJS expects unprefixed tags.
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!name.endsWith('.xml')) continue;
    let xml = await entry.async('string');
    const prefixes = [...xml.matchAll(/xmlns:(\w+)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g)];
    if (!prefixes.length) continue;
    for (const [, prefix] of prefixes) {
      xml = xml.replaceAll('xmlns:' + prefix + '=', 'xmlns=')
        .replace(new RegExp('(<\\/?)' + prefix + ':', 'g'), '$1');
    }
    // Only cell values are imported; presentation-only table definitions are unnecessary.
    xml = xml.replace(/<tableParts[\s\S]*?<\/tableParts>/g, '');
    zip.file(name, xml); normalized = true;
  }
  await book.xlsx.load(normalized ? await zip.generateAsync({ type: 'uint8array' }) : bytes);
  const sheet = book.getWorksheet('WBS');
  if (!sheet) return legacyWorkbook(book);
  const rows = []; sheet.eachRow(row => rows.push(Array.from({ length: Math.max(COLUMNS.length, sheet.getRow(1).cellCount) }, (_, i) => cellValue(row.getCell(i + 1)))));
  return rowsToDocument(rows);
}
export function exportRows(doc) {
  validateDocument(doc);
  const weeks = sprintWeeks(doc.phases), index = value => weeks.findIndex(w => w.start === value) + 1;
  const schedule = item => [item.startWeek ? index(item.startWeek) : '', item.endWeek ? index(item.endWeek) : ''];
  const rows = [COLUMNS];
  for (const p of doc.phases) {
    rows.push([1, p.name, p.id, '', '', '', p.start, p.end, '', '', itemStats(doc, 'phase', p).status, p.color]);
    for (const d of doc.deliverables.filter(d => d.phaseId === p.id)) {
      rows.push([2, d.name, d.id, p.id, '', '', '', '', ...schedule(d), itemStats(doc, 'deliverable', d).status, '']);
      for (const e of doc.epics.filter(e => e.deliverableId === d.id)) {
        rows.push([3, e.name, e.id, p.id, d.id, '', '', '', ...schedule(e), itemStats(doc, 'epic', e).status, '']);
        for (const t of doc.tasks.filter(t => t.epicId === e.id)) rows.push([4, t.name, t.id, p.id, d.id, e.id, '', '', ...schedule(t), t.status, '']);
      }
    }
  }
  return rows;
}
function save(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
export async function downloadWorkbook(doc, template = false) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook(); book.creator = 'Gantt workspace';
  const sheet = book.addWorksheet('WBS', { views: [{ state: 'frozen', ySplit: 1 }] });
  const data = template ? [COLUMNS,
    [1, 'Example phase', 'P1', '', '', '', '2026-10-05', '2026-10-30', '', '', '', '#8761ee'],
    [2, 'Example deliverable', 'D1.1', 'P1', '', '', '', '', '', '', '', ''],
    [3, 'Example epic', 'E1.1.1', 'P1', 'D1.1', '', '', '', '', '', '', ''],
    [4, 'Example task', 'T1.1.1.1', 'P1', 'D1.1', 'E1.1.1', '', '', '', '', '', '']
  ] : exportRows(validateDocument(doc));
  data.forEach(row => sheet.addRow(row));
  sheet.columns = COLUMNS.map(name => ({ width: name === 'Name' ? 65 : ['ID', 'Phase', 'Deliverable', 'Epic'].includes(name) ? 42 : 19 }));
  sheet.getRow(1).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24465D' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  sheet.autoFilter = { from: 'A1', to: 'L1' };
  const guide = book.addWorksheet('Read me');
  const instructions = [
    ['Layer', 'Required fields', 'Optional fields'],
    ['1 - Phase', 'Name, Start Date, End Date', 'ID, Color'],
    ['2 - Deliverable', 'Name, Phase', 'Start Sprint, End Sprint, ID'],
    ['3 - Epic', 'Name, Phase, Deliverable', 'Start Sprint, End Sprint, ID'],
    ['4 - Task', 'Name, Phase, Deliverable, Epic', 'Start Sprint, End Sprint, Status, ID'],
    ['Dates', 'Use YYYY-MM-DD. Phase dates must include a weekday.', ''],
    ['Parents', 'Phase, Deliverable and Epic can refer to a unique name or an ID. IDs resolve duplicate names.', ''],
    ['Status', 'Blank means planned. Values: planned, in_progress, done, canceled.', ''],
    ['Schedule', 'Blank sprint fields mean unscheduled. If supplied, each sprint range must fit its immediate parent range.', ''],
    ['Sprint numbers', 'Derived from the entire phase timeline. Monday-Friday; weekends are excluded.', ''],
    ['Completion', 'Parent progress is computed from descendant tasks. All non-canceled tasks must be Done; empty parents stay Planned.', ''],
    ['Round trip', 'Exported IDs and parent references preserve hierarchy and schedules on re-import.', '']
  ]; instructions.forEach(row => guide.addRow(row)); guide.columns = [{ width: 24 }, { width: 105 }, { width: 50 }];
  if (!template) { const cal = book.addWorksheet('Sprint Calendar'); cal.addRow(['Sprint', 'Monday', 'Friday', 'Workdays']); sprintWeeks(doc.phases).forEach(w => cal.addRow([w.index, w.start, w.end, 5])); cal.columns.forEach(c => c.width = 20); }
  const buffer = await book.xlsx.writeBuffer(); save(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), template ? 'WBS_import_template.xlsx' : 'WBS_gantt_export.xlsx');
}
