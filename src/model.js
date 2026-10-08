export const COLORS = ['#35bde0', '#8761ee', '#f1bd35', '#ea8295', '#38b79c', '#6698ee'];
export const STATUSES = ['planned', 'in_progress', 'done', 'canceled'];
export const STATUS_LABELS = { planned: 'Planned', in_progress: 'In progress', done: 'Done', canceled: 'Canceled' };
export const TYPES = ['phase', 'deliverable', 'epic', 'task'];
export const COLLECTIONS = { phase: 'phases', deliverable: 'deliverables', epic: 'epics', task: 'tasks' };
export const TITLES = { phase: 'Phase', deliverable: 'Deliverable', epic: 'Epic', task: 'Task' };
export const PARENT_KEYS = { deliverable: 'phaseId', epic: 'deliverableId', task: 'epicId' };
export function children(doc, type, id) {
  const childType = TYPES[TYPES.indexOf(type) + 1];
  return childType ? doc[COLLECTIONS[childType]].filter(x => x[PARENT_KEYS[childType]] === id) : [];
}
export function descendants(doc, type, id) {
  return children(doc, type, id).flatMap(item => {
    const childType = TYPES[TYPES.indexOf(type) + 1];
    return [{ type: childType, item }, ...descendants(doc, childType, item.id)];
  });
}
export function parentOf(doc, type, item) {
  const parentType = TYPES[TYPES.indexOf(type) - 1];
  return parentType ? doc[COLLECTIONS[parentType]].find(x => x.id === item[PARENT_KEYS[type]]) : null;
}
export function allowedWeeks(doc, type, item, weeks = sprintWeeks(doc.phases)) {
  const parent = parentOf(doc, type, item);
  return !parent ? [] : type === 'deliverable' ? phaseWeeks(parent, weeks) : rangeWeeks(parent, weeks);
}
// Version 1 used Phase -> Big Task -> Story. Preserve every existing item and
// insert an Epic inside each old big task rather than replacing saved work.
export function migrateDocument(input, blueprint) {
  if (!input || Array.isArray(input.deliverables)) return input;
  if (!Array.isArray(input.phases) || !Array.isArray(input.epics) || !Array.isArray(input.stories)) return input;
  const doc = structuredClone(input), used = new Set([...doc.phases, ...doc.epics, ...doc.stories].map(x => x.id));
  const epicIds = new Map(), epics = [];
  for (const d of doc.epics) {
    const templateId = `D${String(d.id).replace(/^epic-/, '')}`;
    const templates = blueprint?.epics.filter(e => e.deliverableId === templateId) || [];
    const group = templates.length ? templates : [{ id: `${d.id}-epic`, name: d.name }];
    for (const template of group) {
      let id = template.id; while (used.has(id)) id += '-new'; used.add(id);
      epics.push({ id, name: template.name, deliverableId: d.id, startWeek: d.startWeek, endWeek: d.endWeek });
      if (!epicIds.has(d.id)) epicIds.set(d.id, id);
      for (const task of blueprint?.tasks.filter(t => t.epicId === template.id && t.legacyId) || []) epicIds.set(`task:${task.legacyId}`, id);
    }
  }
  return { version: 2, title: doc.title, phases: doc.phases, deliverables: doc.epics,
    epics,
    tasks: doc.stories.map(s => ({ ...s, epicId: epicIds.get(`task:${s.id}`) || epicIds.get(s.epicId), status: s.status || 'planned' })) };
}
const DAY = 86400000;
export function date(value) { return new Date(`${value}T00:00:00Z`); }
export function iso(value) { return value.toISOString().slice(0, 10); }
export function addDays(value, n) { return iso(new Date(date(value).getTime() + n * DAY)); }
export function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(date(value).getTime()) && iso(date(value)) === value; }
export function monday(value) { const day = date(value).getUTCDay(); return addDays(value, day === 6 ? 2 : day === 0 ? 1 : 1 - day); }
export function sprintWeeks(phases) {
  if (!phases.length) return [];
  const start = phases.reduce((v, p) => p.start < v ? p.start : v, phases[0].start);
  const end = phases.reduce((v, p) => p.end > v ? p.end : v, phases[0].end);
  const weeks = []; let week = monday(start);
  while (week <= end) { if (weeks.length >= 520) throw new Error('The overall timeline must be 10 years or shorter.'); weeks.push({ index: weeks.length + 1, start: week, end: addDays(week, 4) }); week = addDays(week, 7); }
  return weeks;
}
export function phaseWeeks(phase, weeks) { return weeks.filter(w => w.start <= phase.end && w.end >= phase.start); }
export function rangeWeeks(item, weeks) { return item.startWeek && item.endWeek ? weeks.filter(w => w.start >= item.startWeek && w.start <= item.endWeek) : []; }
export function rollup(stories) {
  if (!stories.length) return { status: 'planned', progress: 0, done: 0, total: 0, canceled: 0 };
  const active = stories.filter(s => s.status !== 'canceled');
  const done = active.filter(s => s.status === 'done').length;
  const canceled = stories.length - active.length;
  const status = !active.length ? 'canceled' : done === active.length ? 'done' : active.some(s => ['done', 'in_progress'].includes(s.status)) ? 'in_progress' : 'planned';
  return { status, progress: active.length ? Math.round(done / active.length * 100) : 0, done, total: active.length, canceled };
}
export function itemStats(doc, type, item) {
  if (type === 'task') return rollup([item]);
  return rollup(descendants(doc, type, item.id).filter(x => x.type === 'task').map(x => x.item));
}
export function workDays(start, end) {
  if (!start || !end) return 0; let count = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (![0, 6].includes(date(d).getUTCDay())) count++;
  return count;
}
export function uid() { return crypto.randomUUID(); }
export function validateDocument(doc) {
  if (!doc || TYPES.some(t => !Array.isArray(doc[COLLECTIONS[t]]))) throw new Error('Invalid WBS structure. Expected phases, deliverables, epics and tasks.');
  if (doc.phases.length > 100 || doc.deliverables.length > 2000 || doc.epics.length > 5000 || doc.tasks.length > 10000) throw new Error('This WBS is too large (maximum 100 phases, 2,000 deliverables, 5,000 epics and 10,000 tasks).');
  const ids = new Set();
  for (const item of TYPES.flatMap(t => doc[COLLECTIONS[t]])) {
    if (!item.id || ids.has(item.id)) throw new Error(`Duplicate or missing ID: ${item.id || '(blank)'}.`);
    ids.add(item.id); if (!String(item.name || '').trim()) throw new Error(`Name is required for ${item.id}.`);
  }
  for (const p of doc.phases) {
    if (!validDate(p.start) || !validDate(p.end) || p.start > p.end || !workDays(p.start, p.end)) throw new Error(`Phase “${p.name}” needs valid dates containing at least one weekday.`);
    if (p.color && !/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error(`Phase “${p.name}” needs a valid hex color.`);
  }
  const weeks = sprintWeeks(doc.phases);
  if (weeks.length > 520) throw new Error('The overall timeline must be 10 years or shorter.');
  for (const type of TYPES.slice(1)) for (const item of doc[COLLECTIONS[type]]) {
    if (!parentOf(doc, type, item)) throw new Error(`Missing parent ${TITLES[TYPES[TYPES.indexOf(type) - 1]].toLowerCase()} for “${item.name}”.`);
    if (type === 'task' && !STATUSES.includes(item.status)) throw new Error(`Unknown status on “${item.name}”.`);
    validateRange(item, allowedWeeks(doc, type, item, weeks), item.name);
  }
  return doc;
}
export function validateRange(item, allowed, name) {
  if (!item.startWeek && !item.endWeek) return;
  if (!item.startWeek || !item.endWeek || item.startWeek > item.endWeek || !allowed.some(w => w.start === item.startWeek) || !allowed.some(w => w.start === item.endWeek)) throw new Error(`The sprint range for “${name}” must stay within its parent’s schedule.`);
}
function shift(item, delta) { return item.startWeek ? { ...item, startWeek: addDays(item.startWeek, delta * 7), endWeek: addDays(item.endWeek, delta * 7) } : item; }
function fitRange(item, allowed) {
  if (!item.startWeek) return { ...item };
  if (!allowed.length) throw new Error('Schedule the destination parent before moving a scheduled item.');
  const duration = Math.round((date(item.endWeek) - date(item.startWeek)) / (7 * DAY)) + 1;
  if (duration > allowed.length) throw new Error('The item is longer than the destination range. Shorten it or extend the destination first.');
  const first = allowed[0].start, last = allowed[allowed.length - duration].start;
  const target = item.startWeek < first ? first : item.startWeek > last ? last : item.startWeek;
  return shift(item, Math.round((date(target) - date(item.startWeek)) / (7 * DAY)));
}
export function reparent(doc, type, id, parentId) {
  const next = structuredClone(doc), weeks = sprintWeeks(next.phases);
  if (!PARENT_KEYS[type]) throw new Error('Phases cannot be reparented.');
  const key = COLLECTIONS[type], item = next[key].find(x => x.id === id);
  if (!item) throw new Error('Item no longer exists.');
  const moved = { ...item, [PARENT_KEYS[type]]: parentId };
  if (!parentOf(next, type, moved)) throw new Error('Destination parent no longer exists.');
  const fitted = fitRange(moved, allowedWeeks(next, type, moved, weeks));
  const delta = item.startWeek ? Math.round((date(fitted.startWeek) - date(item.startWeek)) / (7 * DAY)) : 0;
  for (const child of descendants(next, type, id)) next[COLLECTIONS[child.type]] = next[COLLECTIONS[child.type]].map(x => x.id === child.item.id ? shift(x, delta) : x);
  next[key] = next[key].map(x => x.id === id ? fitted : x);
  return validateDocument(next);
}
export function changeRange(doc, type, id, startWeek, endWeek, moveChildren = false) {
  const next = structuredClone(doc), key = COLLECTIONS[type];
  const old = next[key].find(x => x.id === id);
  next[key] = next[key].map(x => x.id === id ? { ...x, startWeek, endWeek } : x);
  if (type !== 'task' && moveChildren && old.startWeek && startWeek) {
    const delta = Math.round((date(startWeek) - date(old.startWeek)) / (7 * DAY));
    for (const child of descendants(next, type, id)) next[COLLECTIONS[child.type]] = next[COLLECTIONS[child.type]].map(x => x.id === child.item.id ? shift(x, delta) : x);
  }
  return validateDocument(next);
}
export function removeItem(doc, type, id) {
  const next = structuredClone(doc);
  const ids = new Set([id, ...descendants(next, type, id).map(x => x.item.id)]);
  for (const t of TYPES) next[COLLECTIONS[t]] = next[COLLECTIONS[t]].filter(x => !ids.has(x.id));
  return next;
}
