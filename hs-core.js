/* ============================================================================
   HONEYSTASH SCHEDULER — SHARED CORE
   Loaded by both index.html (full desktop) and quick.html (phone quick-edit).
   One data model, one set of rules, one storage layer. Change it here, both
   pages get it.

   STORAGE KEYS are shared, so on the SAME browser/device the two pages already
   see the same data live. Cross-DEVICE sync is manual (export/import JSON) for
   now; the SYNC block at the bottom is the single place to add live cloud sync
   later without touching anything above it.
   ========================================================================== */

const HS = (function () {

  /* ---- DAYS ---------------------------------------------------------------*/
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /* ---- CANONICAL SHIFT TYPES ---------------------------------------------*/
  /* These match Michael's defined set exactly. cat drives the color + the
     open/close/late classification used by the constraint engine.            */
  const SHIFT_DEFS = {
    off:        { label: 'Off',          in: null,    out: null,    hrs: 0,    cat: 'off'   },
    open730:    { label: 'Open 7:30–4',  in: '07:30', out: '16:00', hrs: 8.5,  cat: 'open'  },
    open745:    { label: 'Open 7:45–4',  in: '07:45', out: '16:00', hrs: 8.25, cat: 'open'  },
    osup9:      { label: 'Open Sup 9–5', in: '09:00', out: '17:00', hrs: 8,    cat: 'open'  },
    osup10:     { label: 'Open Sup 10–6',in: '10:00', out: '18:00', hrs: 8,    cat: 'open'  },
    mid11:      { label: 'Mid 11–7',     in: '11:00', out: '19:00', hrs: 8,    cat: 'mid'   },
    mid12:      { label: 'Mid 12–8',     in: '12:00', out: '20:00', hrs: 8,    cat: 'mid'   },
    latemid:    { label: 'Late Mid 12–10',in:'12:00', out: '22:00', hrs: 10,   cat: 'latemid'},
    close:      { label: 'Close 4–12:15',in: '16:00', out: '00:15', hrs: 8.25, cat: 'close' },
    supclose:   { label: 'Sup Close 4–12:30',in:'16:00',out:'00:30',hrs: 8.5,  cat: 'close' },
    latenight:  { label: 'Late Night 6–2:15', in:'18:00',out:'02:15',hrs:8.25, cat: 'latenight'},
    suplatenight:{label: 'Sup Late Night 6–2:30',in:'18:00',out:'02:30',hrs:8.5,cat:'latenight'},
    sam119:     { label: 'Sam 10hr 11–9',in: '11:00', out: '21:00', hrs: 10,   cat: 'long'  },
    sam1210:    { label: 'Sam 10hr 12–10',in:'12:00', out: '22:00', hrs: 10,   cat: 'long'  },
    custom:     { label: 'Custom',       in: null,    out: null,    hrs: 0,    cat: 'mid'   },
  };

  /* Color class per category — used by both pages' CSS */
  const CAT_CLASS = {
    off: 'sp-off', open: 'sp-open', mid: 'sp-mid', latemid: 'sp-latemid',
    close: 'sp-close', latenight: 'sp-latenight', long: 'sp-long'
  };
  function shiftClass(type) {
    const def = SHIFT_DEFS[type];
    return def ? (CAT_CLASS[def.cat] || 'sp-mid') : 'sp-mid';
  }

  /* Ordered list for dropdowns */
  const SHIFT_ORDER = ['off','open730','open745','osup9','osup10','mid11','mid12',
    'latemid','close','supclose','latenight','suplatenight','sam119','sam1210','custom'];

  /* ---- ROLES & GROUPS -----------------------------------------------------*/
  const ROLE_GROUPS = [
    { label: 'Management',  color: '#64d4f5', roles: ['Store Manager', 'Manager - Inventory', 'Assistant Store Manager'] },
    { label: 'Supervisors', color: '#c8f564', roles: ['Supervisor'] },
    { label: 'Budtenders',  color: '#f5a524', roles: ['Budtender', 'Budtender - PT'] },
    { label: 'Inventory',   color: '#b47ef5', roles: ['inventory lead', 'inventory', 'inventory - PT'] },
  ];
  const ALL_ROLES = ['Store Manager', 'Manager - Inventory', 'Assistant Store Manager',
    'Supervisor', 'Budtender', 'Budtender - PT', 'inventory lead', 'inventory', 'inventory - PT'];

  /* ---- DEFAULT ROSTER -----------------------------------------------------*/
  /* Ryan & Derrick removed. Mike V kept, keyholder = no.
     avail: 1 = available, 0 = unavailable, 2 = prefers off.
     rules: structured constraints the engine actually enforces (see below).  */
  const DEFAULT_EMPLOYEES = [
    { id: 1,  name: 'Alisson Jensen',  role: 'Store Manager',          type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 2,  name: 'Sam Reichbart',   role: 'Manager - Inventory',    type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: 'Sometimes works 10hr shifts (11–9 or 12–10).', rules: {} },
    { id: 3,  name: 'Gabbie Domian',   role: 'Assistant Store Manager',type: 'FT', cap: 0,  ot: 'yes', key: 'no',  avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 4,  name: 'Michael Sheehan', role: 'Supervisor',             type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 5,  name: 'Patrick Hogan',   role: 'Supervisor',             type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 6,  name: 'Alex Wang',       role: 'Supervisor',             type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 7,  name: 'Bailey Shandolow',role: 'Budtender',              type: 'FT', cap: 32, ot: 'no',  key: 'no',  avail: [1,0,1,0,1,1,1], notes: 'Capped 32 hrs. Unavailable Tue/Thu. No closing Mondays.', rules: { noClose: [0], maxHours: 32 } },
    { id: 8,  name: 'Daniel Girod',    role: 'Budtender',              type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: 'Mids and closes only for now (no opens).', rules: { noOpen: true } },
    { id: 9,  name: 'Rene Flynn',      role: 'Budtender',              type: 'FT', cap: 0,  ot: 'no',  key: 'no',  avail: [1,1,1,1,1,1,1], notes: 'Mornings only. Must end by 5:00 PM.', rules: { latestEnd: '17:00' } },
    { id: 11, name: 'Michael Vasquez', role: 'Budtender',              type: 'FT', cap: 0,  ot: 'yes', key: 'no',  avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 12, name: 'Kiki Washington', role: 'Budtender - PT',         type: 'PT', cap: 0,  ot: 'no',  key: 'no',  avail: [1,1,1,1,1,1,1], notes: 'Cannot close Tue or Thu. Prefers daytime.', rules: { noClose: [1,3] } },
    { id: 13, name: 'Rye Deangelo',    role: 'Budtender - PT',         type: 'PT', cap: 0,  ot: 'no',  key: 'no',  avail: [0,1,1,1,1,1,0], notes: 'Available Tue–Sat from 4 PM.', rules: { earliestStart: '16:00' } },
    { id: 14, name: 'Tim Hayes',       role: 'Budtender - PT',         type: 'PT', cap: 0,  ot: 'no',  key: 'no',  avail: [0,1,1,1,1,1,0], notes: 'Available Tue–Sat, closes only.', rules: { closesOnly: true } },
    { id: 15, name: 'Francis Barber',  role: 'inventory lead',         type: 'FT', cap: 0,  ot: 'yes', key: 'yes', avail: [1,1,1,1,1,1,1], notes: '', rules: {} },
    { id: 16, name: 'Shakai Stepney',  role: 'inventory',              type: 'FT', cap: 0,  ot: 'no',  key: 'no',  avail: [1,1,1,1,1,1,1], notes: 'Works 6 PM–12 AM.', rules: { earliestStart: '18:00' } },
    { id: 18, name: 'Logan Martin',    role: 'inventory',              type: 'FT', cap: 0,  ot: 'no',  key: 'no',  avail: [1,1,1,1,1,1,1], notes: 'Full time as of June 2026.', rules: {} },
  ];

  /* ---- ROLE HELPERS -------------------------------------------------------*/
  function isKeyholder(emp)  { return emp.key === 'yes'; }
  function isSupervisor(emp) { return ['Supervisor', 'Store Manager', 'Assistant Store Manager', 'Manager - Inventory'].includes(emp.role); }
  function isBudtender(emp)  { return emp.role.toLowerCase().includes('budtender'); }
  function isInventory(emp)  { return emp.role.toLowerCase().includes('inventory') && !isSupervisor(emp); }
  function isFloorStaff(emp) {
    if (emp.floorStaff === true) return true;
    if (emp.floorStaff === false) return false;
    return isBudtender(emp) || isInventory(emp) || isSupervisor(emp);
  }
  function getRoleGroup(role) {
    return ROLE_GROUPS.find(g => g.roles.some(r => role.toLowerCase() === r.toLowerCase()))
        || ROLE_GROUPS.find(g => g.roles.some(r => role.toLowerCase().includes(r.toLowerCase())));
  }

  /* ---- TIME HELPERS -------------------------------------------------------*/
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseLocalDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function getMonday(s) {
    const d = parseLocalDate(s), day = d.getDay(), diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff); return toDateStr(d);
  }
  function addDays(s, n) { const d = parseLocalDate(s); d.setDate(d.getDate() + n); return d; }
  function formatDate(s, n) { const d = addDays(s, n); return `${d.getMonth() + 1}/${d.getDate()}`; }
  function timeToMins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minsToTime(m) { const h = Math.floor(m / 60) % 24, mn = m % 60, ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12; return `${hh}:${String(mn).padStart(2, '0')} ${ap}`; }
  function toSheetTime(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); h = h % 24; const ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12; return `${hh}:${String(m).padStart(2, '0')} ${ap}`; }

  /* shift in/out resolved (custom carries its own in/out) */
  function shiftIn(s)  { if (!s) return null; const def = SHIFT_DEFS[s.type] || {}; return s.in  || def.in;  }
  function shiftOut(s) { if (!s) return null; const def = SHIFT_DEFS[s.type] || {}; return s.out || def.out; }
  function shiftCat(s) { if (!s) return 'off'; const def = SHIFT_DEFS[s.type]; return def ? def.cat : 'mid'; }

  function getShiftHours(s) {
    if (!s || s.type === 'off') return 0;
    if (s.hrs) return s.hrs;
    const inR = shiftIn(s), outR = shiftOut(s);
    if (!inR || !outR) return 0;
    let inM = timeToMins(inR), outM = timeToMins(outR);
    if (outM <= inM) outM += 1440;
    return (outM - inM) / 60;
  }

  /* ---- BREAK RULES --------------------------------------------------------*/
  /* Michael's spec, exactly:
       ≤ 5 hrs   → 15 min paid (no clock-out)
       5–6.9 hrs → 30 min unpaid (clock-out)
     Longer shifts are common here (8–10 hrs) and in this store still take the
     single 30-min unpaid break, so anything above 5 hrs = 30 CO.             */
  function getBreakInfo(hrs) {
    if (hrs <= 5) return { mins: 15, clockOut: false, label: '15 min paid' };
    return { mins: 30, clockOut: true, label: '30 min unpaid' };
  }

  /* ---- STATE & STORAGE ----------------------------------------------------*/
  const K_EMP = 'hs_employees', K_SCH = 'hs_schedules', K_REQ = 'hs_requests',
        K_WK = 'hs_week', K_ORDER = 'hs_order';

  const state = {
    employees:  JSON.parse(localStorage.getItem(K_EMP) || 'null') || DEFAULT_EMPLOYEES,
    schedules:  JSON.parse(localStorage.getItem(K_SCH) || '{}'),
    requests:   JSON.parse(localStorage.getItem(K_REQ) || '[]'),
    currentWeek: localStorage.getItem(K_WK) || getMonday(todayStr()),
  };

  /* migrate any older saved employees that lack a rules object */
  state.employees.forEach(e => { if (!e.rules) e.rules = {}; });

  let nextEmpId = Math.max(0, ...state.employees.map(e => e.id)) + 1;

  function save() {
    localStorage.setItem(K_EMP, JSON.stringify(state.employees));
    localStorage.setItem(K_SCH, JSON.stringify(state.schedules));
    localStorage.setItem(K_REQ, JSON.stringify(state.requests));
    localStorage.setItem(K_WK, state.currentWeek);
    SYNC.onLocalChange();          // hook — no-op until live sync is wired
    _notify();
  }

  /* let pages react to changes (incl. changes from the other tab) */
  const _listeners = [];
  function onChange(fn) { _listeners.push(fn); }
  function _notify() { _listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }

  /* live sync between the two pages on the SAME device via storage events */
  window.addEventListener('storage', e => {
    if (![K_EMP, K_SCH, K_REQ, K_WK].includes(e.key)) return;
    state.employees = JSON.parse(localStorage.getItem(K_EMP) || 'null') || DEFAULT_EMPLOYEES;
    state.schedules = JSON.parse(localStorage.getItem(K_SCH) || '{}');
    state.requests  = JSON.parse(localStorage.getItem(K_REQ) || '[]');
    state.currentWeek = localStorage.getItem(K_WK) || state.currentWeek;
    state.employees.forEach(emp => { if (!emp.rules) emp.rules = {}; });
    _notify();
  });

  /* ---- SCHEDULE ACCESS ----------------------------------------------------*/
  function getEmpShift(wk, eid, d) { return state.schedules[wk]?.[eid]?.[d] || null; }
  function setEmpShift(wk, eid, d, s) {
    if (!state.schedules[wk]) state.schedules[wk] = {};
    if (!state.schedules[wk][eid]) state.schedules[wk][eid] = {};
    if (!s || s.type === 'off') delete state.schedules[wk][eid][d];
    else state.schedules[wk][eid][d] = s;
    save();
  }
  function getEmpWeekHours(wk, eid) {
    let t = 0; for (let d = 0; d < 7; d++) t += getShiftHours(getEmpShift(wk, eid, d));
    return Math.round(t * 100) / 100;
  }
  function empById(id) { return state.employees.find(e => e.id === id); }

  /* ---- REQUESTS (time off) ------------------------------------------------*/
  function hasRequestOff(eid, d) {
    const wk = state.currentWeek;
    const day = addDays(wk, d);
    const mm = day.getMonth() + 1, dd = day.getDate(), yyyy = day.getFullYear();
    const cands = [`${mm}/${dd}`, `${mm}/${dd}/${yyyy}`, `${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}`];
    return state.requests.some(r => {
      if (r.empId !== eid || r.type !== 'off' || !r.dates) return false;
      return r.dates.split(',').map(s => s.trim()).some(part => {
        if (part.includes('-') && !/^\d{4}/.test(part)) {
          const [a, b] = part.split('-').map(s => s.trim());
          const parse = s => { const [m2, d2, y2] = s.split('/').map(Number); return new Date(y2 || yyyy, m2 - 1, d2); };
          const check = new Date(yyyy, mm - 1, dd);
          return check >= parse(a) && check <= parse(b);
        }
        return cands.includes(part);
      });
    });
  }

  /* ---- CONSTRAINT ENGINE --------------------------------------------------*/
  /* Returns { ok: bool, reason: string } for putting `shift` on emp on day d.
     This is the part the old app didn't have — constraints were just notes.   */
  function checkAssignment(emp, d, shift) {
    if (!shift || shift.type === 'off') return { ok: true };
    const r = emp.rules || {};
    const cat = shiftCat(shift);
    const inM = timeToMins(shiftIn(shift));
    let outM = timeToMins(shiftOut(shift)); if (outM <= inM) outM += 1440;

    if (emp.avail && emp.avail[d] === 0)
      return { ok: false, reason: `${emp.name.split(' ')[0]} is unavailable ${DAYS[d]}` };
    if (hasRequestOff(emp.id, d))
      return { ok: false, reason: `${emp.name.split(' ')[0]} requested ${DAYS[d]} off` };
    if (r.noOpen && cat === 'open')
      return { ok: false, reason: `${emp.name.split(' ')[0]} can't take opens` };
    if (r.closesOnly && !(cat === 'close' || cat === 'latenight'))
      return { ok: false, reason: `${emp.name.split(' ')[0]} works closes only` };
    if (r.noClose && r.noClose.includes(d) && (cat === 'close' || cat === 'latenight'))
      return { ok: false, reason: `${emp.name.split(' ')[0]} can't close ${DAYS[d]}` };
    if (r.earliestStart && inM < timeToMins(r.earliestStart))
      return { ok: false, reason: `${emp.name.split(' ')[0]} starts no earlier than ${toSheetTime(r.earliestStart)}` };
    if (r.latestEnd) {
      const latest = timeToMins(r.latestEnd);
      const cmpOut = outM > 1440 ? outM - 1440 : outM;
      if (cmpOut > latest || outM > 1440)
        return { ok: false, reason: `${emp.name.split(' ')[0]} must end by ${toSheetTime(r.latestEnd)}` };
    }
    return { ok: true };
  }

  /* whole-week conflict + coverage scan */
  function detectConflicts(wk) {
    const errors = [], warnings = [];
    const OPEN_CATS = ['open'], CLOSE_CATS = ['close', 'latenight'];
    const EARLY_CATS = ['open', 'mid'];

    state.employees.forEach(emp => {
      const hrs = getEmpWeekHours(wk, emp.id);

      /* per-day constraint checks */
      for (let d = 0; d < 7; d++) {
        const s = getEmpShift(wk, emp.id, d);
        if (!s || s.type === 'off') continue;
        const c = checkAssignment(emp, d, s);
        if (!c.ok) errors.push({ name: emp.name, msg: c.reason + ` (${DAYS[d]})` });
      }

      /* close → early next day (clopen) */
      for (let d = 0; d < 6; d++) {
        const t = getEmpShift(wk, emp.id, d), n = getEmpShift(wk, emp.id, d + 1);
        if (!t || !n) continue;
        if (CLOSE_CATS.includes(shiftCat(t)) && EARLY_CATS.includes(shiftCat(n)))
          errors.push({ name: emp.name, msg: `Clopen: close ${DAYS[d]} → early ${DAYS[d + 1]}` });
      }

      /* hours */
      const cap = emp.rules?.maxHours || emp.cap;
      if (cap > 0 && hrs > cap + 0.5) errors.push({ name: emp.name, msg: `Over cap: ${hrs}/${cap} hrs` });
      if (emp.ot === 'no' && hrs > 40.5) warnings.push({ name: emp.name, msg: `${hrs} hrs — not OT eligible` });
      if (emp.type === 'FT' && !cap && hrs > 0 && hrs < 32) warnings.push({ name: emp.name, msg: `Only ${hrs} hrs (FT)` });
    });

    /* daily coverage */
    for (let d = 0; d < 7; d++) {
      const dl = `${DAYS[d]} ${formatDate(wk, d)}`;
      const working = state.employees.filter(e => { const s = getEmpShift(wk, e.id, d); return s && s.type !== 'off' && getShiftHours(s) > 0; });
      if (working.length === 0) continue;
      const floor = working.filter(isFloorStaff);
      const keys = working.filter(isKeyholder);
      const buds = working.filter(e => isBudtender(e) || isSupervisor(e));

      if (keys.length === 0) errors.push({ name: dl, msg: 'No keyholder scheduled' });
      if (buds.length === 1) warnings.push({ name: dl, msg: 'Only 1 budtender/supervisor — need 2 on floor' });
      else if (buds.length === 0) errors.push({ name: dl, msg: 'No budtenders scheduled' });

      const covers = (hr) => floor.some(e => { const s = getEmpShift(wk, e.id, d); const a = timeToMins(shiftIn(s)); let b = timeToMins(shiftOut(s)); if (b <= a) b += 1440; const cm = hr * 60; return cm >= a && cm < b; });
      const keyCovers = (hr) => keys.some(e => { const s = getEmpShift(wk, e.id, d); const a = timeToMins(shiftIn(s)); let b = timeToMins(shiftOut(s)); if (b <= a) b += 1440; const cm = hr * 60; return cm >= a && cm < b; });

      if (!covers(8)) warnings.push({ name: dl, msg: 'No one covers 8 AM open' });
      if (covers(23) && !keyCovers(23)) errors.push({ name: dl, msg: 'No keyholder near close' });
    }

    return { errors, warnings };
  }

  /* ---- BREAK SCHEDULER (daily) -------------------------------------------*/
  /* Window starts 2.5 hrs into the shift, steps 15 min to keep floor coverage,
     and avoids two keyholders out at once.                                    */
  function scheduleDayBreaks(wk, d) {
    const list = [];
    state.employees.filter(isFloorStaff).forEach(emp => {
      const s = getEmpShift(wk, emp.id, d);
      if (!s || s.type === 'off') return;
      const hrs = getShiftHours(s); if (hrs === 0) return;
      const inT = shiftIn(s), outT = shiftOut(s);
      if (!inT) return;
      list.push({ emp, shift: s, hrs, in: inT, out: outT, breakInfo: getBreakInfo(hrs), suggestedBreak: timeToMins(inT) + 150 });
    });
    list.sort((a, b) => timeToMins(a.in) - timeToMins(b.in));
    const assigned = [];
    list.forEach(ds => {
      let bStart = ds.suggestedBreak;
      const latest = timeToMins(ds.in) + 300; // no later than 5 hrs in
      while (assigned.some(a => Math.abs(a.breakStart - bStart) < 15) && bStart < latest) bStart += 15;
      if (isKeyholder(ds.emp)) {
        const keyOut = assigned.filter(a => isKeyholder(a.emp) && Math.abs(a.breakStart - bStart) < a.breakMins);
        if (keyOut.length > 0) bStart += 30;
      }
      assigned.push({ ...ds, breakStart: bStart, breakMins: ds.breakInfo.mins });
    });
    return assigned;
  }

  /* ---- EXPORT (Google Sheets, paste at A8) -------------------------------*/
  function getShiftTimes(s) {
    if (!s || s.type === 'off') return { in: '', out: '' };
    return { in: toSheetTime(shiftIn(s)), out: toSheetTime(shiftOut(s)) };
  }
  function buildRow(emp, wk, note) {
    const cols = [emp.name, emp.role];
    for (let d = 0; d < 7; d++) { const t = getShiftTimes(getEmpShift(wk, emp.id, d)); cols.push(t.in, t.out); }
    const hrs = getEmpWeekHours(wk, emp.id);
    cols.push('', hrs > 0 ? hrs.toFixed(2) : '0.00');
    if (note) cols.push(note.replace(/[\r\n]+/g, ' ').trim());
    return cols.join('\t');
  }
  function buildExport(wk) {
    const lines = [];
    const GROUPS = [
      { filter: e => ['Store Manager', 'Manager - Inventory', 'Assistant Store Manager'].includes(e.role), pad: 3 },
      { filter: e => e.role === 'Supervisor', pad: 5 },
      { filter: e => isBudtender(e), pad: 0, trailingBlanks: 3 },
      { filter: e => isInventory(e), pad: 0 },
    ];
    GROUPS.forEach((grp, gi) => {
      const emps = state.employees.filter(grp.filter);
      emps.forEach(e => lines.push(buildRow(e, wk, e.notes ? e.notes.split('.')[0] : '')));
      if (grp.pad > 0) for (let i = emps.length; i < grp.pad; i++) lines.push('\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t');
      if (gi < GROUPS.length - 1) { const b = grp.trailingBlanks || 1; for (let k = 0; k < b; k++) lines.push(''); }
    });
    return lines.join('\n');
  }

  /* ---- ROSTER MUTATIONS ---------------------------------------------------*/
  function addEmployee(data) { state.employees.push({ id: nextEmpId++, rules: {}, ...data }); save(); }
  function updateEmployee(id, data) { const e = empById(id); if (e) Object.assign(e, data); save(); }
  function removeEmployee(id) { state.employees = state.employees.filter(e => e.id !== id); save(); }
  function moveEmployee(id, dir) {
    const i = state.employees.findIndex(e => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.employees.length) return;
    [state.employees[i], state.employees[j]] = [state.employees[j], state.employees[i]];
    save();
  }
  function reorderEmployee(srcId, targetId) {
    const si = state.employees.findIndex(e => e.id === srcId);
    const ti = state.employees.findIndex(e => e.id === targetId);
    if (si < 0 || ti < 0) return;
    const [m] = state.employees.splice(si, 1);
    state.employees.splice(ti, 0, m);
    save();
  }
  function setWeek(wk) { state.currentWeek = getMonday(wk); save(); }

  /* ---- BACKUP / RESTORE (manual cross-device sync) ------------------------*/
  function exportBackup() {
    return JSON.stringify({
      app: 'Honeystash Scheduler', version: 3,
      exportedAt: new Date().toISOString(),
      employees: state.employees, schedules: state.schedules,
      requests: state.requests, currentWeek: state.currentWeek
    }, null, 2);
  }
  function importBackup(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !data.employees) throw new Error('That file is not a Honeystash backup.');
    state.employees = data.employees;
    state.schedules = data.schedules || {};
    state.requests = data.requests || [];
    state.currentWeek = data.currentWeek || state.currentWeek;
    state.employees.forEach(e => { if (!e.rules) e.rules = {}; });
    nextEmpId = Math.max(0, ...state.employees.map(e => e.id)) + 1;
    save();
  }

  /* ========================================================================
     SYNC HOOK — the ONLY place to add live cross-device sync later.
     Right now it's a no-op. To turn on cloud sync, implement push()/pull()
     against a tiny backend (Firebase, jsonbin, or a published Apps Script web
     app that reads/writes the schedule sheet). Nothing above changes.
     ===================================================================== */
  const SYNC = {
    enabled: false,
    onLocalChange() { /* if (this.enabled) this.push(); */ },
    async push() { /* send exportBackup() to your endpoint */ },
    async pull() { /* fetch JSON, then importBackup(data) */ },
  };

  /* ---- PUBLIC API ---------------------------------------------------------*/
  return {
    DAYS, DAY_LABELS, SHIFT_DEFS, SHIFT_ORDER, shiftClass, ROLE_GROUPS, ALL_ROLES,
    state, save, onChange,
    isKeyholder, isSupervisor, isBudtender, isInventory, isFloorStaff, getRoleGroup,
    todayStr, parseLocalDate, toDateStr, getMonday, addDays, formatDate,
    timeToMins, minsToTime, toSheetTime, shiftIn, shiftOut, shiftCat,
    getShiftHours, getBreakInfo,
    getEmpShift, setEmpShift, getEmpWeekHours, empById,
    hasRequestOff, checkAssignment, detectConflicts, scheduleDayBreaks,
    buildExport, addEmployee, updateEmployee, removeEmployee, moveEmployee,
    reorderEmployee, setWeek, exportBackup, importBackup, SYNC,
  };
})();
