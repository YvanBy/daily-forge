// ─── Habit definitions ────────────────────────────────────────────────────────
const HABITS = {
  morning: [
    { key: 'wake_7am',         label: 'Wake up at 7 am' },
    { key: 'make_bed',         label: 'Make Bed' },
    { key: 'water_teeth_am',   label: 'Drink water + Brush teeth' },
    { key: 'meditation_am',    label: 'Meditation + Prayer' },
    { key: 'sport_shower',     label: 'Sport + Shower' },
    { key: 'read_am',          label: 'Read' },
    { key: 'boot_os',          label: 'Boot up Operating System (e.g. reflect, prioritize)' },
    { key: 'eat_frog',         label: 'Eat that frog (MIT)' },
  ],
  evening: [
    { key: 'clean',            label: 'Clean' },
    { key: 'spaziergang',      label: 'Spaziergang' },
    { key: 'brush_teeth_pm',   label: 'Brush teeth' },
    { key: 'read_pm',          label: 'Read' },
    { key: 'shutdown_os',      label: 'Shut down Operating System (e.g. clarify, organize)' },
    { key: 'journaling',       label: 'Radical honest journaling' },
    { key: 'meditation_pm',    label: 'Meditation + Prayer' },
    { key: 'bed_11pm',         label: 'Go to bed at 11 pm' },
    { key: 'no_toxics',        label: 'No Toxics' },
    { key: 'dopamin_detox',    label: 'Dopamin Detox' },
  ],
};

const ALL_HABITS = [...HABITS.morning, ...HABITS.evening];
const STREAK_THRESHOLD = 14;

const MORNING_JOURNAL_FIELDS = [
  { key: 'feel_now',   label: 'How do I feel right now?' },
  { key: 'one_thing',  label: 'What is the ONE thing that would make today a success?' },
  { key: 'avoiding',   label: 'What am I avoiding, and why?' },
  { key: 'who_to_be',  label: 'Who do I need to be today?' },
  { key: 'regret',     label: 'What would I regret not doing today?' },
];

const EVENING_JOURNAL_FIELDS = [
  { key: 'how_was_day',    label: 'How was my day?' },
  { key: 'did_i_do_it',    label: 'Did I do what I said I would do?' },
  { key: 'learned',        label: 'What did I learn today that I didn\'t know this morning?' },
  { key: 'wasted_energy',  label: 'Where did I waste energy on the wrong thing?' },
  { key: 'grateful',       label: 'What am I grateful for that I almost missed?' },
  { key: 'capture',        label: 'What needs to be captured before I sleep?' },
];

// ─── Database ─────────────────────────────────────────────────────────────────
const db = new Dexie('DailyForge');
db.version(1).stores({ entries: 'id,date,savedAt' });

// ─── Module state ─────────────────────────────────────────────────────────────
let todayEntry = null;
let editMode   = false;
let formState  = {};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function keyToDate(key) {
  return new Date(key + 'T12:00:00');
}

function formatDateHeader(key) {
  const d   = keyToDate(key);
  const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
  const mon = ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()];
  return `${day}, ${mon} ${d.getDate()} · Daily Forge`;
}

function formatDateShort(key) {
  const d   = keyToDate(key);
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${day} ${d.getDate()} ${mon}`;
}

// ─── Streak / stats helpers ───────────────────────────────────────────────────
function countCompleted(entry) {
  if (!entry || !entry.routines) return 0;
  return ALL_HABITS.filter(h => entry.routines[h.key]).length;
}

function qualifies(entry) {
  return countCompleted(entry) >= STREAK_THRESHOLD;
}

async function computeStreak() {
  const entries = await db.entries.toArray();
  const map = {};
  entries.forEach(e => (map[e.id] = e));

  const today  = todayKey();
  let streak   = 0;
  const cursor = new Date();

  if (!map[today]) cursor.setDate(cursor.getDate() - 1);

  while (true) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (!map[key] || !qualifies(map[key])) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// ─── Form state helpers ───────────────────────────────────────────────────────
function emptyJournal(fields) {
  const obj = {};
  fields.forEach(f => (obj[f.key] = ''));
  return obj;
}

function buildEmptyFormState() {
  const routines = {};
  ALL_HABITS.forEach(h => (routines[h.key] = false));
  return {
    wakeTime:       '07:00',
    lightsOffTime:  '22:30',
    bedTime:        '22:45',
    fearMapDone:    false,
    fearMapContact: '',
    routines,
    morningJournal: emptyJournal(MORNING_JOURNAL_FIELDS),
    eveningJournal: emptyJournal(EVENING_JOURNAL_FIELDS),
  };
}

function entryToFormState(entry) {
  return {
    wakeTime:       entry.wakeTime       || '07:00',
    lightsOffTime:  entry.lightsOffTime  || '22:30',
    bedTime:        entry.bedTime        || '22:45',
    fearMapDone:    !!entry.fearMapDone,
    fearMapContact: entry.fearMapContact || '',
    routines:       { ...entry.routines },
    morningJournal: { ...emptyJournal(MORNING_JOURNAL_FIELDS), ...(entry.morningJournal || {}) },
    eveningJournal: { ...emptyJournal(EVENING_JOURNAL_FIELDS), ...(entry.eveningJournal || {}) },
  };
}

// ─── Misc UI ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────
async function initTodayView() {
  const key  = todayKey();
  todayEntry = (await db.entries.get(key)) || null;
  const streak = await computeStreak();

  if (todayEntry && !editMode) {
    formState = entryToFormState(todayEntry);
    renderTodayReadOnly(streak);
  } else {
    if (!todayEntry && !editMode) formState = buildEmptyFormState();
    renderTodayForm(streak);
  }
}

// ── Read-only render ──────────────────────────────────────────────────────────
function renderTodayReadOnly(streak) {
  const view = document.getElementById('view-today');
  view.innerHTML = `
    <div class="header">
      <div class="header-title">${formatDateHeader(todayKey())}</div>
      <div class="streak-badge">🔥 ${streak}</div>
    </div>
    <div class="read-only-banner">
      <span>${countCompleted(todayEntry)} / ${ALL_HABITS.length} habits completed</span>
      <button class="edit-link" id="edit-btn">Edit</button>
    </div>
    ${sleepHtml(true)}
    ${fearMapHtml(true)}
    ${journalHtml('morning', true)}
    ${habitsHtml('morning', true)}
    ${habitsHtml('evening', true)}
    ${journalHtml('evening', true)}
    <div style="height: 32px;"></div>
  `;

  document.getElementById('edit-btn').addEventListener('click', () => {
    editMode  = true;
    formState = entryToFormState(todayEntry);
    initTodayView();
  });
}

// ── Editable render ───────────────────────────────────────────────────────────
function renderTodayForm(streak) {
  const view = document.getElementById('view-today');
  view.innerHTML = `
    <div class="header">
      <div class="header-title">${formatDateHeader(todayKey())}</div>
      <div class="streak-badge">🔥 ${streak}</div>
    </div>
    ${sleepHtml(false)}
    ${fearMapHtml(false)}
    ${journalHtml('morning', false)}
    ${habitsHtml('morning', false)}
    ${habitsHtml('evening', false)}
    ${journalHtml('evening', false)}
    <div style="height: 88px;"></div>
    <div class="bottom-bar">
      <button class="save-btn" id="save-btn">Save Day</button>
    </div>
  `;

  // Time inputs
  ['wakeTime', 'lightsOffTime', 'bedTime'].forEach(field => {
    const el = document.getElementById(`input-${field}`);
    if (!el) return;
    el.value = formState[field];
    el.addEventListener('change', e => { formState[field] = e.target.value; });
  });

  // Fear map toggle + contact input
  const fearToggle  = document.getElementById('fear-toggle');
  const fearContact = document.getElementById('fear-contact');

  function syncFearMap() {
    const sw = document.getElementById('fear-switch');
    sw.classList.toggle('on', formState.fearMapDone);
    fearContact.classList.toggle('visible', formState.fearMapDone);
    fearContact.value = formState.fearMapContact;
  }
  syncFearMap();

  fearToggle.addEventListener('click', () => {
    formState.fearMapDone = !formState.fearMapDone;
    syncFearMap();
  });
  fearContact.addEventListener('input', e => { formState.fearMapContact = e.target.value; });

  // Morning journal textareas
  MORNING_JOURNAL_FIELDS.forEach(f => {
    const el = document.getElementById(`mj-${f.key}`);
    if (!el) return;
    el.value = formState.morningJournal[f.key];
    el.addEventListener('input', e => { formState.morningJournal[f.key] = e.target.value; });
  });

  // Evening journal textareas
  EVENING_JOURNAL_FIELDS.forEach(f => {
    const el = document.getElementById(`ej-${f.key}`);
    if (!el) return;
    el.value = formState.eveningJournal[f.key];
    el.addEventListener('input', e => { formState.eveningJournal[f.key] = e.target.value; });
  });

  // Habit checkboxes
  ALL_HABITS.forEach(h => {
    const row = document.getElementById(`habit-${h.key}`);
    if (!row) return;

    function syncRow() {
      row.classList.toggle('checked', !!formState.routines[h.key]);
    }
    syncRow();

    row.addEventListener('click', () => {
      formState.routines[h.key] = !formState.routines[h.key];
      syncRow();
    });
  });

  document.getElementById('save-btn').addEventListener('click', saveToday);
}

// ── HTML builders ─────────────────────────────────────────────────────────────
function sleepHtml(readOnly) {
  const f = formState;
  if (readOnly) {
    return `
      <div class="section">
        <div class="section-title">Sleep</div>
        <div class="time-row"><span class="time-label">Wake up</span><span class="time-value">${esc(f.wakeTime)}</span></div>
        <div class="time-row"><span class="time-label">Lights off</span><span class="time-value">${esc(f.lightsOffTime)}</span></div>
        <div class="time-row"><span class="time-label">Bed time</span><span class="time-value">${esc(f.bedTime)}</span></div>
      </div>`;
  }
  return `
    <div class="section">
      <div class="section-title">Sleep</div>
      <div class="time-row">
        <label class="time-label" for="input-wakeTime">Wake up</label>
        <input type="time" class="time-input" id="input-wakeTime">
      </div>
      <div class="time-row">
        <label class="time-label" for="input-lightsOffTime">Lights off</label>
        <input type="time" class="time-input" id="input-lightsOffTime">
      </div>
      <div class="time-row">
        <label class="time-label" for="input-bedTime">Bed time</label>
        <input type="time" class="time-input" id="input-bedTime">
      </div>
    </div>`;
}

function fearMapHtml(readOnly) {
  const f = formState;
  if (readOnly) {
    const contactLine = f.fearMapDone && f.fearMapContact
      ? `<div class="time-row"><span class="time-label">Who?</span><span class="time-value">${esc(f.fearMapContact)}</span></div>`
      : '';
    return `
      <div class="section">
        <div class="section-title">Fear Map</div>
        <div class="time-row">
          <span class="time-label">Did you reach out?</span>
          <span class="time-value">${f.fearMapDone ? '✓ Yes' : '–'}</span>
        </div>
        ${contactLine}
      </div>`;
  }
  return `
    <div class="section">
      <div class="section-title">Fear Map</div>
      <div class="fear-toggle-row" id="fear-toggle">
        <span class="fear-label">Did you reach out?</span>
        <div class="toggle-switch" id="fear-switch">
          <div class="toggle-knob"></div>
        </div>
      </div>
      <input type="text" class="fear-contact-input" id="fear-contact" placeholder="Who did you contact?">
    </div>`;
}

function journalHtml(period, readOnly) {
  const isMorning = period === 'morning';
  const fields    = isMorning ? MORNING_JOURNAL_FIELDS : EVENING_JOURNAL_FIELDS;
  const title     = isMorning ? 'Morning Journal' : 'Evening Journal';
  const stateKey  = isMorning ? 'morningJournal' : 'eveningJournal';
  const prefix    = isMorning ? 'mj' : 'ej';

  const fieldHtml = fields.map(f => {
    const val = formState[stateKey][f.key];
    if (readOnly) {
      return val
        ? `<div class="journal-field">
            <div class="journal-label">${esc(f.label)}</div>
            <div class="journal-value">${esc(val)}</div>
           </div>`
        : '';
    }
    return `
      <div class="journal-field">
        <label class="journal-label" for="${prefix}-${f.key}">${esc(f.label)}</label>
        <textarea class="journal-textarea" id="${prefix}-${f.key}" rows="2" placeholder="${esc(f.label)}"></textarea>
      </div>`;
  }).join('');

  // In read-only mode, skip the section entirely if nothing was written
  if (readOnly && !fieldHtml.trim()) return '';

  return `
    <div class="section">
      <div class="section-title">${title}</div>
      <div class="journal-fields">${fieldHtml}</div>
    </div>`;
}

function habitsHtml(group, readOnly) {
  const title = group === 'morning' ? 'Morning Routines' : 'Evening Routines';
  const rows = HABITS[group].map(h => {
    const checked = formState.routines[h.key] ? ' checked' : '';
    if (readOnly) {
      return `<div class="habit-row read-only${checked}">
        <div class="habit-checkbox"></div>
        <span class="habit-label">${esc(h.label)}</span>
      </div>`;
    }
    return `<div class="habit-row${checked}" id="habit-${h.key}">
      <div class="habit-checkbox"></div>
      <span class="habit-label">${esc(h.label)}</span>
    </div>`;
  }).join('');

  return `<div class="section"><div class="section-title">${title}</div>${rows}</div>`;
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveToday() {
  const key   = todayKey();
  const entry = {
    id:             key,
    date:           key,
    wakeTime:       formState.wakeTime,
    lightsOffTime:  formState.lightsOffTime,
    bedTime:        formState.bedTime,
    fearMapDone:    formState.fearMapDone,
    fearMapContact: formState.fearMapContact,
    routines:       { ...formState.routines },
    morningJournal: { ...formState.morningJournal },
    eveningJournal: { ...formState.eveningJournal },
    savedAt:        Date.now(),
  };
  await db.entries.put(entry);
  todayEntry = entry;
  editMode   = false;
  showToast('Day saved ✓');
  initTodayView();
}

// ─── LOG VIEW ─────────────────────────────────────────────────────────────────
async function initLogView() {
  const [streak, entries] = await Promise.all([computeStreak(), db.entries.toArray()]);

  const map = {};
  entries.forEach(e => (map[e.id] = e));

  const today = new Date();
  const rows  = [];
  for (let i = 0; i < 30; i++) {
    const d   = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    rows.push({ key, entry: map[key] || null });
  }

  const rowsHtml = rows.map(({ key, entry }) => {
    const count    = countCompleted(entry);
    const hasEntry = !!entry;
    const dotClass = !hasEntry ? 'empty' : qualifies(entry) ? 'green' : 'red';
    const fearIcon = hasEntry && entry.fearMapDone ? ' <span class="log-fear-icon" title="Fear Map done">🤝</span>' : '';

    let expandHtml = '';
    if (hasEntry) {
      const meta = [];
      if (entry.wakeTime)    meta.push(`Wake ${entry.wakeTime} · Lights off ${entry.lightsOffTime} · Bed ${entry.bedTime}`);
      if (entry.fearMapDone) meta.push(`Fear Map: ${esc(entry.fearMapContact || '–')}`);
      const metaLine = meta.length ? `<div class="log-meta">${meta.join('<br>')}</div>` : '';

      const habitLines = ALL_HABITS.map(h => {
        const done = entry.routines?.[h.key];
        return `<div class="log-habit-item">
          <span class="${done ? 'log-check' : 'log-miss'}">${done ? '✓' : '○'}</span>
          <span>${esc(h.label)}</span>
        </div>`;
      }).join('');

      // Journal entries in log
      const mjLines = MORNING_JOURNAL_FIELDS
        .filter(f => entry.morningJournal?.[f.key])
        .map(f => `<div class="log-journal-item"><span class="log-journal-q">${esc(f.label)}</span><span class="log-journal-a">${esc(entry.morningJournal[f.key])}</span></div>`)
        .join('');

      const ejLines = EVENING_JOURNAL_FIELDS
        .filter(f => entry.eveningJournal?.[f.key])
        .map(f => `<div class="log-journal-item"><span class="log-journal-q">${esc(f.label)}</span><span class="log-journal-a">${esc(entry.eveningJournal[f.key])}</span></div>`)
        .join('');

      const mjSection = mjLines ? `<div class="log-journal-section"><div class="log-journal-title">Morning Journal</div>${mjLines}</div>` : '';
      const ejSection = ejLines ? `<div class="log-journal-section"><div class="log-journal-title">Evening Journal</div>${ejLines}</div>` : '';

      expandHtml = `<div class="log-expand">${metaLine}${habitLines}${mjSection}${ejSection}</div>`;
    }

    return `
      <div class="log-row" data-key="${key}">
        <div class="log-row-header">
          <span class="log-date">${formatDateShort(key)}${fearIcon}</span>
          <div class="log-right">
            <span class="log-ratio">${hasEntry ? `${count} / ${ALL_HABITS.length}` : '–'}</span>
            <div class="log-dot ${dotClass}"></div>
          </div>
        </div>
        ${expandHtml}
      </div>`;
  }).join('');

  const view = document.getElementById('view-log');
  view.innerHTML = `
    <div class="log-streak-header">
      <div class="log-streak-number">🔥 ${streak}</div>
      <div class="log-streak-label">Current streak · days</div>
    </div>
    <div class="log-list">${rowsHtml}</div>
  `;

  view.querySelectorAll('.log-row').forEach(row => {
    row.querySelector('.log-row-header').addEventListener('click', () => {
      row.classList.toggle('open');
    });
  });
}

// ─── WHY VIEW ─────────────────────────────────────────────────────────────────
function initWhyView() {
  const view = document.getElementById('view-why');
  view.innerHTML = `
    <div class="why-wrap">
      <p class="why-quote">Every morning I train the gap between stimulus and reaction.<br>Every evening I review who I was in that gap.<br>This is not productivity. This is becoming.</p>
      <div class="why-list">
        <div class="why-item">
          <span class="why-star">✦</span>
          <span class="why-text">Sensation → Observation → Equanimity → Response</span>
        </div>
        <div class="why-item">
          <span class="why-star">✦</span>
          <span class="why-text">God's light is ahead. The shadow is behind.</span>
        </div>
        <div class="why-item">
          <span class="why-star">✦</span>
          <span class="why-text">I show myself mercy — as fuel, not excuse.</span>
        </div>
      </div>
    </div>
  `;
}

// ─── EXPORT VIEW ──────────────────────────────────────────────────────────────
function initExportView() {
  const view = document.getElementById('view-export');
  view.innerHTML = `
    <div class="export-wrap">
      <div class="export-title">Export Data</div>
      <div class="export-desc">Download all your Daily Forge entries as a CSV file.</div>
      <button class="export-btn" id="export-btn">Export all data as CSV</button>
    </div>
  `;
  document.getElementById('export-btn').addEventListener('click', exportCSV);
}

async function exportCSV() {
  const entries   = await db.entries.orderBy('id').toArray();
  const habitKeys = ALL_HABITS.map(h => h.key);
  const mjKeys    = MORNING_JOURNAL_FIELDS.map(f => f.key);
  const ejKeys    = EVENING_JOURNAL_FIELDS.map(f => f.key);

  const headers = [
    'date', 'wakeTime', 'lightsOffTime', 'bedTime',
    'fearMapDone', 'fearMapContact',
    ...habitKeys,
    ...mjKeys,
    ...ejKeys,
  ];

  function csvText(val) {
    return `"${String(val || '').replace(/"/g, '""')}"`;
  }

  const csvRows = entries.map(e => [
    e.date,
    e.wakeTime      || '',
    e.lightsOffTime || '',
    e.bedTime       || '',
    e.fearMapDone   ? 'true' : 'false',
    csvText(e.fearMapContact),
    ...habitKeys.map(k => (e.routines?.[k] ? 'true' : 'false')),
    ...mjKeys.map(k => csvText(e.morningJournal?.[k])),
    ...ejKeys.map(k => csvText(e.eveningJournal?.[k])),
  ].join(','));

  const csv  = [headers.join(','), ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `daily-forge-export-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === `view-${tab}`)
  );

  if (tab === 'why')    initWhyView();
  if (tab === 'today')  initTodayView();
  if (tab === 'log')    initLogView();
  if (tab === 'export') initExportView();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  switchTab('today');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});
