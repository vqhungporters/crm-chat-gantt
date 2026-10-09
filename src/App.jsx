import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, ChevronLeft, ChevronsDownUp, ChevronsUpDown, Download, Upload, Search, GripVertical, Pencil, X, Undo2, Redo2, CalendarDays, Layers3, Check, Circle, Clock3, FileSpreadsheet, ArrowUpRight, Trash2, MoveHorizontal, AlertCircle, CheckCircle2 } from 'lucide-react';
import seed from './initial-data.json';
import LayerDialog from './LayerDialog.jsx';
import { TYPES, TITLES, PARENT_KEYS, children, parentOf, allowedWeeks, taskDateRange, dragTaskSchedule, changeTaskDates, migrateDocument, STATUS_LABELS, STATUSES, addDays, date, sprintWeeks, itemStats, workDays, validateDocument, reparent, changeRange, removeItem } from './model.js';
import { readImport, downloadWorkbook } from './io.js';

const STORAGE = 'chat-gantt.workspace.v2';
const LEGACY_STORAGE = 'chat-gantt.workspace.v1';
const fmt = (s, options = { day: 'numeric', month: 'short' }) => date(s).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
const clone = doc => structuredClone(doc);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function load() { try { const saved = localStorage.getItem(STORAGE) || localStorage.getItem(LEGACY_STORAGE); if (saved) return validateDocument(migrateDocument(JSON.parse(saved), seed)); } catch { /* Keep the supplied WBS available if saved data is unreadable. */ } return clone(seed); }
function IconButton({ icon: Icon, label, ...props }) { return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon size={16}/></button>; }
function Ring({ progress, color }) { return <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="#e9ecf2" strokeWidth="2"/><circle cx="10" cy="10" r="7.5" fill="none" stroke={color} strokeWidth="2" strokeDasharray={`${progress / 100 * 47.124} 47.124`} strokeLinecap="round" transform="rotate(-90 10 10)"/></svg>; }
function Modal({ children, onClose, label }) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; el.showModal(); return () => { if (el.open) el.close(); }; }, []);
  return <dialog ref={ref} className="modal" aria-label={label} onCancel={onClose} onClick={e => { if (e.target === ref.current) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}><div>{children}</div></dialog>;
}
function ImportDialog({ onClose, onImport, currentCount }) {
  const [parsed, setParsed] = useState(null), [fileName, setFileName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef(null);
  async function read(file) { if (!file) return; setBusy(true); setError(''); setParsed(null); try { setParsed(await readImport(file)); setFileName(file.name); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function template() { setBusy(true); try { await downloadWorkbook(null, true); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <Modal onClose={onClose} label="Import WBS"><div className="modal-heading"><div><div className="eyebrow">WORK BREAKDOWN STRUCTURE</div><h2>Import your WBS</h2></div><IconButton icon={X} label="Close import" onClick={onClose}/></div>
    <p className="modal-copy">Bring phases, deliverables, epics and tasks onto one timeline. Sprint ranges and statuses are optional.</p>
    <button className="drop-file" disabled={busy} onClick={() => input.current.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(e.dataTransfer.files[0]); }}><div className="upload-icon"><FileSpreadsheet size={26}/></div><strong>{busy ? 'Reading your file…' : fileName || 'Choose a file or drop it here'}</strong><span>Excel (.xlsx), CSV or JSON · up to 10 MB</span></button>
    <input ref={input} type="file" accept=".xlsx,.csv,.json" className="sr-only" aria-label="WBS import file" onChange={e => read(e.target.files[0])}/>
    <button className="template-link" onClick={template} disabled={busy}><Download size={15}/>Download import template<ArrowUpRight size={14}/></button>
    {parsed && <div className="import-preview"><CheckCircle2 size={20}/><div><strong>Ready to import</strong><p>{parsed.phases.length} phases · {parsed.deliverables.length} deliverables · {parsed.epics.length} epics · {parsed.tasks.length} tasks</p><small>Blank statuses become Planned. This replaces the current {currentCount}-task chart; Undo restores it.</small></div></div>}
    {error && <div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}
    <div className="modal-footer"><span className="field-help">Parents can use names or IDs.</span><button className="primary-button" disabled={!parsed || busy} onClick={() => { onImport(parsed); onClose(); }}>Import WBS</button></div>
  </Modal>;
}

export default function App() {
  const [history, setHistory] = useState(() => ({ doc: load(), past: [], future: [] }));
  const doc = history.doc;
  const [collapsed, setCollapsed] = useState(() => new Set(['P0', 'D1.1']));
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [zoom, setZoom] = useState(160), [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null), [saved, setSaved] = useState(true), [exporting, setExporting] = useState(false), [dragged, setDragged] = useState(null), [dropTarget, setDropTarget] = useState(null), [preview, setPreview] = useState(null);
  const [sideWidth, setSideWidth] = useState(window.innerWidth < 750 ? 340 : 520);
  const scroll = useRef(null), barDrag = useRef(null), firstScroll = useRef(false);
  const weeks = useMemo(() => sprintWeeks(doc.phases), [doc.phases]);
  const done = doc.tasks.filter(s => s.status === 'done').length;
  const focusWeek = weeks.find(w => w.end >= today) || weeks.at(-1);
  const [selectedWeek, setSelectedWeek] = useState('');
  function notify(message, bad = false) { setToast({ message, bad }); }
  function commit(next, message) { try { validateDocument(next); setHistory(h => ({ doc: next, past: [...h.past.slice(-39), h.doc], future: [] })); if (message) notify(message); } catch (e) { notify(e.message, true); } }
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(doc)); setSaved(true); } catch { setSaved(false); } }, [doc]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.bad ? 6500 : 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const onResize = () => setSideWidth(window.innerWidth < 750 ? 340 : 520); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, []);
  function jump(start, behavior = 'smooth') { const i = weeks.findIndex(w => w.start === start); if (i >= 0) { scroll.current?.scrollTo({ left: Math.max(0, i * zoom), behavior }); setSelectedWeek(start); } }
  useEffect(() => { if (!firstScroll.current && focusWeek && scroll.current) { firstScroll.current = true; jump(focusWeek.start, 'instant'); } }, [weeks]);
  function undo() { setHistory(h => h.past.length ? { doc: h.past.at(-1), past: h.past.slice(0, -1), future: [h.doc, ...h.future] } : h); }
  function redo() { setHistory(h => h.future.length ? { doc: h.future[0], past: [...h.past, h.doc], future: h.future.slice(1) } : h); }
  useEffect(() => { const key = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) && !dialog) { e.preventDefault(); e.shiftKey ? redo() : undo(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [dialog]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase(), activeFilter = !!q || filter !== 'all';
    function visit(type, item, phase, inheritedMatch = false) {
      const selfMatch = inheritedMatch || (!!q && item.name.toLowerCase().includes(q));
      const childType = TYPES[TYPES.indexOf(type) + 1];
      const childRows = children(doc, type, item.id).flatMap(child => visit(childType, child, phase, selfMatch));
      const matches = type === 'task' ? (!q || selfMatch) && (filter === 'all' || item.status === filter) : filter === 'all' && selfMatch;
      if (activeFilter && !matches && !childRows.length) return [];
      const row = { type, item, phase, level: TYPES.indexOf(type) + 1 };
      return [row, ...(!activeFilter && collapsed.has(item.id) ? [] : childRows)];
    }
    return doc.phases.flatMap(phase => visit('phase', phase, phase));
  }, [doc, collapsed, query, filter]);
  function toggle(id) { setCollapsed(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function edit(row) { setDialog({ type: row.type, item: row.item }); }
  function addChild(row) {
    const config = { type: TYPES[TYPES.indexOf(row.type) + 1] };
    let item = row.item, type = row.type;
    while (item) { config[PARENT_KEYS[TYPES[TYPES.indexOf(type) + 1]]] = item.id; item = parentOf(doc, type, item); type = TYPES[TYPES.indexOf(type) - 1]; }
    setDialog(config);
  }
  function startReparent(e, row) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.item.id); setDragged({ type: row.type, id: row.item.id }); }
  function accepts(row) { return dragged && TYPES.indexOf(dragged.type) === TYPES.indexOf(row.type) + 1; }
  function drop(e, row) {
    e.preventDefault(); if (!accepts(row)) return;
    try { commit(reparent(doc, dragged.type, dragged.id, row.item.id), `${TITLES[dragged.type]} moved with its descendants. Schedule adjusted to fit the new parent.`); setCollapsed(old => { const next = new Set(old); next.delete(row.item.id); return next; }); }
    catch (err) { notify(err.message, true); }
    setDragged(null); setDropTarget(null);
  }
  function rowRange(row, item = row.item) {
    if (row.type === 'phase') return { start: item.start, end: item.end };
    if (row.type === 'task') return taskDateRange(doc, item);
    return item.startWeek ? { start: item.startWeek < row.phase.start ? row.phase.start : item.startWeek, end: addDays(item.endWeek, 4) > row.phase.end ? row.phase.end : addDays(item.endWeek, 4) } : null;
  }
  function geometry(range) {
    if (!range || !weeks.length) return null;
    const position = value => { const w = weeks.find(w => w.start <= value && w.end >= value); if (!w) return null; return (w.index - 1) * zoom + ((date(value) - date(w.start)) / 86400000) * (zoom / 5); };
    // Phase boundaries on weekends map to their first/last business day.
    let start = range.start, end = range.end;
    while ([0,6].includes(date(start).getUTCDay())) start = addDays(start, 1);
    while ([0,6].includes(date(end).getUTCDay())) end = addDays(end, -1);
    const a = position(start), b = position(end); return a === null || b === null ? null : { left: a + 4, width: Math.max(8, b - a + zoom / 5 - 8) };
  }
  function beginBar(e, row, mode) {
    if (e.button !== 0 || row.type === 'phase') return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    const allowed = allowedWeeks(doc, row.type, row.item, weeks);
    barDrag.current = { row, mode, x: e.clientX, allowed, start: row.item.startWeek, end: row.item.endWeek, moved: false, nextStart: row.item.startWeek, nextEnd: row.item.endWeek };
  }
  function moveBar(e) {
    const d = barDrag.current; if (!d) return;
    if (d.row.type === 'task') {
      if (Math.abs(e.clientX - d.x) > 5) d.moved = true;
      const schedule = dragTaskSchedule(doc, d.row.item, d.mode, Math.round((e.clientX - d.x) / (zoom / 5)));
      d.taskSchedule = schedule; setPreview({ id: d.row.item.id, ...schedule }); return;
    }
    let delta = Math.round((e.clientX - d.x) / zoom);
    if (Math.abs(e.clientX - d.x) > 5) d.moved = true;
    const min = d.allowed[0]?.start, max = d.allowed.at(-1)?.start; if (!min || !max) return;
    let start = d.start, end = d.end;
    if (d.mode === 'move') {
      const lo = Math.round((date(min) - date(start)) / 604800000), hi = Math.round((date(max) - date(end)) / 604800000);
      delta = Math.max(lo, Math.min(hi, delta)); start = addDays(start, delta * 7); end = addDays(end, delta * 7);
    } else if (d.mode === 'start') { start = addDays(start, delta * 7); start = start < min ? min : start > end ? end : start; }
    else { end = addDays(end, delta * 7); end = end > max ? max : end < start ? start : end; }
    d.nextStart = start; d.nextEnd = end; setPreview({ id: d.row.item.id, startWeek: start, endWeek: end });
  }
  function endBar() {
    const d = barDrag.current; if (!d) return; barDrag.current = null; setPreview(null);
    if (!d.moved) { if (d.mode === 'move') edit(d.row); return; }
    try { commit(d.row.type === 'task' ? changeTaskDates(doc, d.row.item.id, d.taskSchedule.start, d.taskSchedule.end) : changeRange(doc, d.row.type, d.row.item.id, d.nextStart, d.nextEnd, d.mode === 'move'), 'Schedule updated.'); } catch (e) { notify(e.message, true); }
  }
  async function exportFile() { setExporting(true); try { await downloadWorkbook(doc); notify('WBS exported with the current hierarchy, schedule and statuses.'); } catch (e) { notify(e.message, true); } finally { setExporting(false); } }
  const timelineWidth = weeks.length * zoom;
  return <main className="app-shell">
    <header className="page-header"><div><div className="breadcrumb"><span className="workspace-symbol"><Layers3 size={16}/></span>PROJECT WORKSPACE<ChevronRight size={12}/>GANTT CHART</div><h1>{doc.title || 'Project schedule'}</h1><p>{doc.phases.length} phases <span>·</span> {doc.deliverables.length} deliverables <span>·</span> {doc.epics.length} epics <span>·</span> {doc.tasks.length} tasks <span className="summary-divider"/> <span className="done-summary"><CheckCircle2 size={14}/>{done} completed</span></p></div><div className="header-actions"><span className={`save-label ${saved ? '' : 'warning'}`}><span/>{saved ? 'Saved locally' : 'Local saving unavailable'}</span><button className="secondary-button" onClick={() => setDialog({ import: true })}><Upload size={16}/>Import WBS</button><button className="secondary-button" disabled={exporting} onClick={exportFile}><Download size={16}/>{exporting ? 'Exporting…' : 'Export'}</button><button className="primary-button" onClick={() => setDialog({ type: 'phase' })}><Plus size={17}/>Add layer</button></div></header>
    <section className="chart-card" aria-label="Interactive Gantt chart">
      <div className="chart-topbar"><div className="view-label"><span><MoveHorizontal size={18}/></span>Project timeline</div><div className="chart-filters"><div className="search-box"><Search size={16}/><input aria-label="Search phases and tasks" placeholder="Search phases and tasks…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14}/></button>}</div><select aria-label="Filter by status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div></div>
      <div className="chart-toolbar"><div className="toolbar-section"><button className="toolbar-button" onClick={() => setCollapsed(new Set([...doc.phases, ...doc.deliverables, ...doc.epics].map(x => x.id)))}><ChevronsDownUp size={15}/>Collapse all</button><button className="toolbar-button" onClick={() => setCollapsed(new Set())}><ChevronsUpDown size={15}/>Expand all</button><span className="toolbar-divider"/><IconButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!history.past.length} onClick={undo}/><IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!history.future.length} onClick={redo}/></div><div className="toolbar-section"><span className="sprint-caption"><CalendarDays size={14}/>1 sprint = 5 weekdays</span><select aria-label="Timeline zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={112}>Compact</option><option value={160}>Comfortable</option><option value={220}>Detailed</option></select><select aria-label="Jump to sprint" value={selectedWeek || focusWeek?.start || ''} onChange={e => jump(e.target.value)}>{weeks.map(w => <option key={w.start} value={w.start}>Sprint {w.index} · {fmt(w.start)}</option>)}</select></div></div>
      <div ref={scroll} className="gantt-scroll" style={{ '--side-width': `${sideWidth}px`, '--week-width': `${zoom}px`, '--day-width': `${zoom / 5}px` }}>
        <div className="gantt-header" style={{ width: sideWidth + timelineWidth }}><div className="header-left row-left" style={{ width: sideWidth }}><span>Work breakdown</span><span>Status</span><span>Days</span></div><div className="timeline-head" style={{ width: timelineWidth }}>{weeks.map(w => <div className={`week-heading ${focusWeek?.start === w.start ? 'focus-week' : ''}`} key={w.start} style={{ width: zoom }}><div className="week-caption"><strong>Sprint {w.index}</strong><span>{fmt(w.start)} – {fmt(w.end)}</span></div><div className="day-headings">{['M','T','W','T','F'].map((day, i) => <span key={i} title={fmt(addDays(w.start, i), { weekday: 'long', day: 'numeric', month: 'long' })}>{day}<small>{date(addDays(w.start, i)).getUTCDate()}</small></span>)}</div></div>)}</div></div>
        {visible.map(row => {
          const { item, phase, type, level } = row; const stats = itemStats(doc, type, item);
          const displayed = preview?.id === item.id ? { ...item, ...preview } : item;
          const range = rowRange(row, displayed), box = geometry(range);
          const count = children(doc, type, item.id).length;
          const parentDrop = accepts(row), highlighted = parentDrop && dropTarget === item.id;
          return <div key={item.id} data-layer={type} data-name={item.name} className={`gantt-row layer-${level} ${highlighted ? 'drop-target' : ''} ${dragged?.id === item.id ? 'is-dragging' : ''}`} style={{ width: sideWidth + timelineWidth }} onDragOver={e => { if (parentDrop) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(item.id); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }} onDrop={e => drop(e, row)}>
            <div className="row-left" style={{ width: sideWidth }}><div className="task-cell" style={{ paddingLeft: 16 + (level - 1) * 20 }}>
              {type !== 'phase' && <span draggable className="drag-handle" title={`Drag ${TITLES[type].toLowerCase()} to a ${TITLES[TYPES[TYPES.indexOf(type) - 1]].toLowerCase()} (descendants follow)`} onDragStart={e => startReparent(e, row)} onDragEnd={() => { setDragged(null); setDropTarget(null); }}><GripVertical size={14}/></span>}
              {type !== 'task' ? <button className="collapse-button" aria-label={`${collapsed.has(item.id) ? 'Expand' : 'Collapse'} ${item.name}`} onClick={() => toggle(item.id)}>{collapsed.has(item.id) ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button> : <span className="task-dot"/>}
              {type === 'phase' && <span className="phase-dot" style={{ background: phase.color }}/>}
              <button className="task-name" title={item.name} onClick={() => edit(row)}>{item.name}</button>
              {type !== 'task' && <span className="child-count">{count}</span>}
              <div className="row-actions">{type !== 'task' && <IconButton icon={Plus} label={`Add ${TITLES[TYPES[TYPES.indexOf(type) + 1]].toLowerCase()} to ${item.name}`} onClick={() => addChild(row)}/>}<IconButton icon={Pencil} label={`Edit ${item.name}`} onClick={() => edit(row)}/></div>
            </div><div className="status-cell">{type === 'task' ? <div className={`task-status ${item.status}`}><span/><select aria-label={`Status for ${item.name}`} value={item.status} onChange={e => commit({ ...doc, tasks: doc.tasks.map(s => s.id === item.id ? { ...s, status: e.target.value } : s) })}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div> : <div className="parent-status" title={`${STATUS_LABELS[stats.status]} · ${stats.done}/${stats.total} active tasks done${stats.canceled ? ` · ${stats.canceled} canceled` : ''}`}><Ring progress={stats.progress} color={phase.color}/><span>{stats.status === 'canceled' ? 'Canceled' : `${stats.progress}%`}</span></div>}</div><div className="days-cell">{range ? workDays(range.start, range.end) : '—'}</div></div>
            <div className="timeline-cell" style={{ width: timelineWidth }}>
              {!range && <button className="unscheduled" style={{ left: Math.max(12, (weeks.findIndex(w => w.start === focusWeek?.start)) * zoom + 12) }} onClick={() => edit(row)}><Plus size={12}/>Schedule</button>}
              {box && <div className={`gantt-bar ${type} ${stats.status} ${preview?.id === item.id ? 'moving' : ''}`} style={{ left: box.left, width: box.width, '--phase-color': phase.color }} title={`${item.name}\n${fmt(range.start)} – ${fmt(range.end)} · ${STATUS_LABELS[stats.status]}\n${type === 'phase' ? 'Click to edit phase dates' : 'Drag to move; drag edges to resize; click to edit'}`} onPointerDown={e => beginBar(e, row, 'move')} onPointerMove={moveBar} onPointerUp={endBar} onPointerCancel={() => { barDrag.current = null; setPreview(null); }} onClick={type === 'phase' ? () => edit(row) : undefined} role="button" tabIndex={0} aria-label={`Edit schedule for ${item.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(row); } }}>
                {type !== 'phase' && <span className="bar-handle left" onPointerDown={e => beginBar(e, row, 'start')}/>}<span className="bar-label">{stats.status === 'done' && <Check size={12}/>} {type === 'phase' ? fmt(range.start) + ' – ' + fmt(range.end) : type !== 'task' ? item.name : workDays(range.start, range.end) + ' days'}</span>{type !== 'phase' && <span className="bar-handle right" onPointerDown={e => beginBar(e, row, 'end')}/>}</div>}
            </div>
          </div>;
        })}
        {!visible.length && <div className="empty-chart"><CalendarDays size={32}/><h3>{doc.phases.length ? 'No matching work' : 'Your next project starts here'}</h3><p>{doc.phases.length ? 'Try a different search or status filter.' : 'Add a phase or import a WBS to build your timeline.'}</p>{!doc.phases.length && <button className="primary-button" onClick={() => setDialog({ type: 'phase' })}><Plus size={16}/>Add your first phase</button>}</div>}
      </div>
      <footer className="chart-footer"><div className="phase-legend">{doc.phases.map(p => <span key={p.id} title={p.name}><i style={{ background: p.color }}/>{p.name.split(' · ')[0].split(' - ')[0]}</span>)}</div><span className="interaction-hint"><GripVertical size={13}/>Drag handles to change parent <span>·</span> Drag bars to schedule</span></footer>
    </section>
    <div className="below-chart"><span>Completion excludes canceled tasks. Epics, deliverables and phases update automatically.</span><span>{weeks.length} weekly sprints <span>·</span> Weekends excluded</span></div>
    {dialog?.import && <ImportDialog currentCount={doc.tasks.length} onClose={() => setDialog(null)} onImport={next => { commit(next, 'WBS imported.'); setCollapsed(new Set()); firstScroll.current = false; }}/>}
    {dialog && !dialog.import && <LayerDialog Modal={Modal} IconButton={IconButton} fmt={fmt} today={today} doc={doc} config={dialog} onClose={() => setDialog(null)} onSave={commit} onDelete={(type, id) => commit(removeItem(doc, type, id), 'Layer deleted. Undo is available.')}/>}
    {toast && <div className={`toast ${toast.bad ? 'error' : ''}`} role={toast.bad ? 'alert' : 'status'}>{toast.bad ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15}/></button></div>}
  </main>;
}
