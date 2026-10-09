import { useState } from 'react';
import { AlertCircle, CalendarDays, Check, Trash2, X } from 'lucide-react';
import { TYPES, COLLECTIONS, TITLES, PARENT_KEYS, COLORS, STATUSES, STATUS_LABELS, addDays, sprintWeeks, allowedWeeks, allowedTaskDays, taskDateRange, taskSchedule, taskSprintSchedule, changeTaskDates, workDays, uid, parentOf, validateDocument, reparent, changeRange } from './model.js';

export default function LayerDialog({ doc, config, onClose, onSave, onDelete, Modal, IconButton, fmt, today }) {
  const original = config.item;
  const [type, setType] = useState(config.type);
  const ancestorIds = { phaseId: config.phaseId || '', deliverableId: config.deliverableId || '', epicId: config.epicId || '' };
  let ancestor = original, ancestorType = config.type;
  while (ancestor && ancestorType !== 'phase') {
    ancestorIds[PARENT_KEYS[ancestorType]] = ancestor[PARENT_KEYS[ancestorType]];
    ancestor = parentOf(doc, ancestorType, ancestor); ancestorType = TYPES[TYPES.indexOf(ancestorType) - 1];
  }
  if (!ancestorIds.phaseId) ancestorIds.phaseId = doc.phases[0]?.id || '';
  const [parents, setParents] = useState(ancestorIds);
  const [name, setName] = useState(original?.name || '');
  const [start, setStart] = useState(original?.start || today), [end, setEnd] = useState(original?.end || addDays(today, 28));
  const [color, setColor] = useState(original?.color || COLORS[doc.phases.length % COLORS.length]);
  const [startWeek, setStartWeek] = useState(original?.startWeek || ''), [endWeek, setEndWeek] = useState(original?.endWeek || '');
  const initialDates = config.type === 'task' && original ? taskDateRange(doc, original) : null;
  const [taskStart, setTaskStart] = useState(initialDates?.start || ''), [taskEnd, setTaskEnd] = useState(initialDates?.end || '');
  const [status, setStatus] = useState(original?.status || 'planned');
  const [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const allowed = allowedWeeks(doc, type, parents, sprintWeeks(doc.phases));
  const taskDays = type === 'task' ? allowedTaskDays(doc, parents) : [];
  function selectSprints(a, b) {
    if (a && !b) b = a;
    setStartWeek(a); setEndWeek(b); setError('');
    if (type === 'task') {
      try { const schedule = taskSprintSchedule(doc, parents, a || null, b || null); setTaskStart(schedule.start || ''); setTaskEnd(schedule.end || ''); }
      catch (e) { setError(e.message); }
    }
  }
  function selectDates(a, b) {
    setTaskStart(a); setTaskEnd(b); setError('');
    try { const schedule = taskSchedule(doc, parents, a || null, b || null); setStartWeek(schedule.startWeek || ''); setEndWeek(schedule.endWeek || ''); }
    catch (e) { setError(e.message); }
  }
  function changeParent(value, parentType) {
    const childIndex = TYPES.indexOf(parentType) + 1, nextParents = { ...parents, [PARENT_KEYS[TYPES[childIndex]]]: value };
    for (const deeper of TYPES.slice(childIndex + 1)) nextParents[PARENT_KEYS[deeper]] = '';
    setParents(nextParents); setStartWeek(''); setEndWeek(''); setTaskStart(''); setTaskEnd(''); setError('');
    if (original && TYPES.indexOf(type) === childIndex) {
      try { const next = reparent(doc, type, original.id, value), fitted = next[COLLECTIONS[type]].find(x => x.id === original.id); setStartWeek(fitted.startWeek || ''); setEndWeek(fitted.endWeek || ''); if (type === 'task') { const dates = taskDateRange(next, fitted); setTaskStart(dates?.start || ''); setTaskEnd(dates?.end || ''); } }
      catch (e) { setError(e.message); }
    }
  }
  function submit(event) {
    event.preventDefault(); setError('');
    try {
      if (!name.trim()) throw new Error('A name is required.');
      let next = structuredClone(doc); const id = original?.id || uid(), key = COLLECTIONS[type];
      if (type === 'phase') {
        const item = { id, name: name.trim(), start, end, color };
        next.phases = original ? next.phases.map(x => x.id === id ? item : x) : [...next.phases, item];
      } else {
        const parentKey = PARENT_KEYS[type], parentId = parents[parentKey];
        if (!parentOf(doc, type, parents)) throw new Error('Select the complete parent hierarchy.');
        if (type === 'task') {
          const schedule = taskSchedule(next, parents, taskStart || null, taskEnd || null);
          if ((schedule.startWeek || '') !== startWeek || (schedule.endWeek || '') !== endWeek) throw new Error('Complete the task dates and sprint range before saving.');
        }
        if (original) {
          if (original[parentKey] !== parentId) next = reparent(next, type, id, parentId);
          next = type === 'task' ? changeTaskDates(next, id, taskStart || null, taskEnd || null) : changeRange(next, type, id, startWeek || null, endWeek || null, true);
          next[key] = next[key].map(x => x.id === id ? { ...x, name: name.trim(), ...(type === 'task' ? { status } : {}) } : x);
        } else next[key].push({ id, name: name.trim(), [parentKey]: parentId, startWeek: startWeek || null, endWeek: endWeek || null, ...(type === 'task' ? { status, ...taskSchedule(next, parents, taskStart || null, taskEnd || null) } : {}) });
      }
      onSave(validateDocument(next), `${TITLES[type]} ${original ? 'updated' : 'added'}.`); onClose();
    } catch (e) { setError(e.message); }
  }
  return <Modal onClose={onClose} label={`${original ? 'Edit' : 'Add'} ${TITLES[type]}`}>
    <div className="modal-heading"><div><div className="eyebrow">{original ? 'EDIT LAYER' : 'BUILD YOUR WORK BREAKDOWN'}</div><h2>{original ? 'Edit' : 'Add'} {TITLES[type].toLowerCase()}</h2></div><IconButton icon={X} label="Close dialog" onClick={onClose}/></div>
    {!original && <div className="layer-tabs">{TYPES.map((v, i) => <button key={v} className={type === v ? 'active' : ''} type="button" onClick={() => { setType(v); setStartWeek(''); setEndWeek(''); setTaskStart(''); setTaskEnd(''); setError(''); }}><span>{i + 1}</span>{TITLES[v]}</button>)}</div>}
    <form onSubmit={submit}>
      {TYPES.slice(0, TYPES.indexOf(type)).map((parentType, i) => {
        const childType = TYPES[i + 1], selectedKey = PARENT_KEYS[childType];
        const options = doc[COLLECTIONS[parentType]].filter(x => parentType === 'phase' || x[PARENT_KEYS[parentType]] === parents[PARENT_KEYS[parentType]]);
        return <label className="field" key={parentType}>Parent {TITLES[parentType].toLowerCase()} <span>*</span><select required value={parents[selectedKey]} onChange={e => changeParent(e.target.value, parentType)}><option value="">Select a {TITLES[parentType].toLowerCase()}</option>{options.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
      })}
      <label className="field">{TITLES[type]} name <span>*</span><input required autoFocus maxLength={300} value={name} onChange={e => setName(e.target.value)}/></label>
      {type === 'phase' ? <><div className="field-pair"><label className="field">Start date <span>*</span><input required type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label className="field">End date <span>*</span><input required type="date" min={start} value={end} onChange={e => setEnd(e.target.value)}/></label></div><label className="field">Phase color<div className="color-picker">{COLORS.map(c => <button type="button" key={c} aria-label={`Choose ${c}`} className={color === c ? 'selected' : ''} style={{ background: c }} onClick={() => setColor(c)}>{color === c && <Check size={14}/>}</button>)}</div></label><p className="field-help">Each sprint runs Monday–Friday. The entire phase timeline determines sprint numbering.</p></> : <>
        <div className="schedule-heading"><CalendarDays size={15}/><span>Sprint schedule</span><small>Optional</small></div>
        <div className="field-pair"><label className="field">From sprint<select value={startWeek} disabled={!allowed.length} onChange={e => { const v = e.target.value; selectSprints(v, !v ? '' : !endWeek || endWeek < v ? v : endWeek); }}><option value="">Unscheduled</option>{allowed.map(w => <option key={w.start} value={w.start}>Sprint {w.index} · {fmt(w.start)}</option>)}</select></label><label className="field">To sprint<select value={endWeek} disabled={!startWeek} onChange={e => selectSprints(startWeek, e.target.value)}><option value="">Select end sprint</option>{allowed.filter(w => !startWeek || w.start >= startWeek).map(w => <option key={w.start} value={w.start}>Sprint {w.index} · {fmt(w.end)}</option>)}</select></label></div>
        {type === 'task' && <><div className="field-pair"><label className="field">Start date<input type="date" disabled={!taskDays.length} min={taskDays[0]} max={taskDays.at(-1)} value={taskStart} onChange={e => { const v = e.target.value; selectDates(v, !v ? '' : !taskEnd || taskEnd < v ? v : taskEnd); }}/></label><label className="field">End date<input type="date" disabled={!taskStart} min={taskStart || taskDays[0]} max={taskDays.at(-1)} value={taskEnd} onChange={e => selectDates(taskStart, e.target.value)}/></label></div><p className="field-help">{taskStart && taskEnd ? `${workDays(taskStart, taskEnd)} working day(s). ` : ''}Dates and sprints stay in sync. Drag task edges to resize by working day. Saturday and Sunday are excluded.</p></>}
        <p className="field-help">{allowed.length ? 'The range must fit its parent. Moving a parent moves all scheduled descendants; resizing cannot exclude them.' : 'Schedule the parent first to choose sprints.'}</p>
        {type === 'task' && <label className="field">Status<select value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>}
      </>}
      {error && <div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}
      {confirmDelete && <div className="delete-confirm"><p>Delete this {TITLES[type].toLowerCase()}{type !== 'task' ? ' and all its descendants' : ''}? You can undo the change.</p><button type="button" className="danger-button" onClick={() => { onDelete(type, original.id); onClose(); }}>Confirm deletion</button></div>}
      <div className="modal-footer">{original ? <button type="button" className="text-button danger" onClick={() => setConfirmDelete(v => !v)}><Trash2 size={15}/>Delete</button> : <span/>}<div className="flex items-center gap-2"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{original ? 'Save changes' : `Add ${TITLES[type].toLowerCase()}`}</button></div></div>
    </form>
  </Modal>;
}
