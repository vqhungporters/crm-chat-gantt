import fs from 'node:fs/promises';
import { epics } from '../tmp/wbs/revised-data.mjs';
const add = n => new Date(Date.UTC(2026,7,3) + (n - 1) * 7 * 86400000).toISOString().slice(0,10);
const phases = [
 ['Phase 0 · Initial foundation','2026-08-01','2026-09-18','#35bde0'],
 ['Phase 1 · Permission settings & Chat','2026-09-21','2026-10-30','#8761ee'],
 ['Phase 2 · Read states, Mentions & Bookmarks','2026-11-02','2026-12-31','#f1bd35'],
 ['Phase 3 · Deployment','2027-01-04','2027-02-28','#ea8295']
].map(([name,start,end,color],i)=>({id:`phase-${i}`,name,start,end,color}));
const doc={version:1,title:'Chat feature schedule',phases,epics:epics.map(e=>({id:`epic-${e.id}`,phaseId:`phase-${e.p}`,name:e.title,startWeek:add(Math.min(...e.tasks.map(t=>t.s))),endWeek:add(Math.max(...e.tasks.map(t=>t.s)))})),stories:epics.flatMap(e=>e.tasks.map(t=>({id:`story-${t.id}`,epicId:`epic-${e.id}`,name:t.title,status:t.done?'done':'planned',startWeek:add(t.s),endWeek:add(t.s)})))};
await fs.mkdir('src',{recursive:true});await fs.writeFile('src/initial-data.json',JSON.stringify(doc,null,2));
console.log(`Seeded ${doc.phases.length} phases, ${doc.epics.length} big tasks, ${doc.stories.length} stories.`);
