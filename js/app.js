// ─────────────────────────────────────────────────────────────────
//  Lab Reservation App — app.js
//  Depends on: Supabase JS v2, config.js
// ─────────────────────────────────────────────────────────────────

// ── Supabase client ───────────────────────────────────────────────
const supabase = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

// ── Derived constants ─────────────────────────────────────────────
const LAB_IDS   = CONFIG.LABS.map(l => l.id);
const LAB_NAMES = CONFIG.LABS.map(l => l.name);
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function fmtTime(h) {
  const hh = Math.floor(h), mm = h % 1 === .5 ? '30' : '00';
  const ap = hh < 12 ? 'AM' : 'PM', h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${ap}`;
}
const SLOT_LABELS = CONFIG.SLOT_START_HOURS.map(h => `${fmtTime(h)} – ${fmtTime(h + 1.5)}`);
function timeToH(t) { const [h, m] = t.split(':').map(Number); return h + m / 60; }

// ── App state ─────────────────────────────────────────────────────
let currentUser = null;
let currentUserEmail = '';
let isAdmin = false;
let currentPage = 'home';
let currentAdminTab = 'approvals';
let currentLab = 0;
let currentDateOffset = 0;

let allReservations = {};
let allStaff = {};
let allClasses = {};
let semesterData = {};
let myNotifsSeen = {};

let pendingSlotInfo = null;
let pendingCancelKey = null;
let pendingApprovalKey = null;
let editingStaffId = null;
let editingClassId = null;

// ── Helpers ───────────────────────────────────────────────────────
function dateFromOffset(o) { const d = new Date(); d.setDate(d.getDate() + o); return d; }
function dateStr(d) { return d.toISOString().slice(0, 10); }
function friendlyDate(d) {
  const today = new Date(), tom = new Date();
  tom.setDate(today.getDate() + 1);
  const ds = dateStr(d);
  if (ds === dateStr(today)) return 'Today, ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (ds === dateStr(tom))   return 'Tomorrow, ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function slotKey(labId, ds, idx) { return `${labId}__${ds}__${idx}`; }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeOnBg(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function timeAgoStr(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (d > 0) return `${d} day${d > 1 ? 's' : ''} ago`;
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ago`;
  if (m > 0) return `${m} min ago`;
  return 'just now';
}

// ── Availability logic ────────────────────────────────────────────
function staffAvailable(labId, dow, h) {
  return Object.values(allStaff).some(s => {
    if (s.lab_id !== labId || !s.days || !s.days.includes(dow)) return false;
    const sh = timeToH(s.start_time || '08:00'), eh = timeToH(s.end_time || '17:00');
    return sh <= h && eh >= (h + 1.5);
  });
}
function classBlocked(labId, dow, h) {
  return Object.values(allClasses).some(c => {
    if (c.lab_id !== labId || c.day !== dow) return false;
    const cs = timeToH(c.start_time || '08:00'), ce = timeToH(c.end_time || '09:30');
    return h < ce && (h + 1.5) > cs;
  });
}
function todayAvailableCount(labId) {
  const d = new Date(), dow = d.getDay(), ds = dateStr(d);
  let n = 0;
  CONFIG.SLOT_START_HOURS.forEach((h, i) => {
    if (staffAvailable(labId, dow, h) && !classBlocked(labId, dow, h) && !allReservations[slotKey(labId, ds, i)]) n++;
  });
  return n;
}

// ── Auth ──────────────────────────────────────────────────────────
async function sendMagicLink() {
  const emailEl = document.getElementById('auth-email');
  const email = emailEl.value.trim().toLowerCase();
  const errEl = document.getElementById('auth-email-err');
  const isValid = email.endsWith(CONFIG.ALLOWED_EMAIL_DOMAIN) && email.includes('@');
  errEl.classList.toggle('vis', !isValid);
  if (!isValid) return;

  const btn = document.getElementById('auth-btn');
  btn.disabled = true; btn.textContent = 'Sending…';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });

  if (error) {
    errEl.textContent = 'Could not send email. Please try again.';
    errEl.classList.add('vis');
    btn.disabled = false; btn.textContent = 'Send sign-in link';
    return;
  }

  document.getElementById('auth-sent-email').textContent = email;
  document.getElementById('auth-form-wrap').style.display = 'none';
  document.getElementById('auth-sent').style.display = '';
}

function resetAuthForm() {
  document.getElementById('auth-form-wrap').style.display = '';
  document.getElementById('auth-sent').style.display = 'none';
  document.getElementById('auth-btn').disabled = false;
  document.getElementById('auth-btn').textContent = 'Send sign-in link';
  document.getElementById('auth-email').value = '';
}

async function signOut() {
  await supabase.auth.signOut();
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  resetAuthForm();
}

// ── Navigation ────────────────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  ['home', 'book', 'notifs'].forEach(p => {
    document.getElementById('page-' + p).style.display = p === page ? '' : 'none';
    document.getElementById('nav-' + p).classList.toggle('active', p === page);
  });
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'flex';
  document.getElementById('admin-toggle-btn').textContent = 'Admin';
  document.getElementById('admin-toggle-btn').onclick = goAdmin;
  if (page === 'home')   renderHome();
  if (page === 'book')   renderBookPage();
  if (page === 'notifs') renderNotifs();
}

function goAdmin() {
  document.getElementById('bottom-nav').style.display = 'none';
  ['page-home', 'page-book', 'page-notifs'].forEach(p => document.getElementById(p).style.display = 'none');
  document.getElementById('admin-view').style.display = '';
  document.getElementById('admin-toggle-btn').textContent = '← Back';
  document.getElementById('admin-toggle-btn').onclick = () => navigate(currentPage || 'home');
  adminTab('approvals');
}

// ── HOME ──────────────────────────────────────────────────────────
function renderHome() {
  const semBadge = semesterData.name ? `<span class="hero-sem">📆 ${esc(semesterData.name)}</span>` : '';
  const labCards = CONFIG.LABS.map((lab, i) => {
    const avail = todayAvailableCount(lab.id);
    const availStyle = avail > 0
      ? 'background:var(--green-bg);color:var(--green-text)'
      : 'background:var(--gray-bg);color:var(--gray-text)';
    return `<div class="lab-card" onclick="navigate('book');setTimeout(()=>selectLab(${i}),50)">
      <div class="lab-card-icon">${lab.icon}</div>
      <div class="lab-card-name">${esc(lab.name)}</div>
      <div class="lab-card-sub">${esc(lab.desc)}</div>
      <span class="lab-card-avail" style="${availStyle}">${avail} slot${avail === 1 ? '' : 's'} today</span>
    </div>`;
  }).join('');

  document.getElementById('page-home').innerHTML = `
    <div class="landing">
      <div class="hero">
        <div class="hero-icon">🔬</div>
        <h2>Research Lab Reservations</h2>
        <p>Book time in our research labs. Reservations are reviewed and confirmed by the lab admin.</p>
        ${semBadge}
        <div class="hero-btns">
          <button class="hero-btn hero-btn-primary" onclick="navigate('book')">View schedule</button>
          <button class="hero-btn hero-btn-secondary" onclick="navigate('notifs')">My reservations</button>
        </div>
      </div>
      <div class="labs-grid">${labCards}</div>
      <div class="how-section">
        <div class="how-title">How it works</div>
        <div class="how-step"><div class="how-num">1</div><div class="how-step-text"><strong>Choose a slot</strong><span class="how-step-sub">Pick a lab, date, and available time. Slots are only open when a staff member is on duty and no class is scheduled.</span></div></div>
        <div class="how-step"><div class="how-num">2</div><div class="how-step-text"><strong>Submit your request</strong><span class="how-step-sub">Enter your unit, section, and all student IDs. Teams can book up to ${CONFIG.MAX_SLOTS_PER_WEEK} slots per lab per week.</span></div></div>
        <div class="how-step"><div class="how-num">3</div><div class="how-step-text"><strong>Wait for approval</strong><span class="how-step-sub">The lab admin reviews your request. Check the Updates tab for the decision.</span></div></div>
        <div class="how-step"><div class="how-num">4</div><div class="how-step-text"><strong>Show up on time</strong><span class="how-step-sub">Bring your student IDs. Each session is 1.5 hours.</span></div></div>
      </div>
    </div>`;
}

// ── BOOK ──────────────────────────────────────────────────────────
function renderBookPage() {
  if (!document.getElementById('page-book').querySelector('.tabs')) {
    document.getElementById('page-book').innerHTML = `
      <div class="tabs">
        ${CONFIG.LABS.map((l, i) => `<button class="tab-btn ${i===0?'active':''}" onclick="selectLab(${i})" id="tab-${i}">${l.icon} ${l.name}</button>`).join('')}
      </div>
      <div class="date-nav">
        <button onclick="changeDay(-1)" aria-label="Previous day">‹</button>
        <span class="date-label" id="date-label">—</span>
        <button onclick="changeDay(1)" aria-label="Next day">›</button>
      </div>
      <div id="limit-banner" class="banner banner-warn"></div>
      <div id="slots-container" class="slots-list">
        <div class="loading-state"><div class="spinner"></div>Loading schedule…</div>
      </div>`;
  }
  renderSlots();
}

function selectLab(idx) {
  currentLab = idx;
  document.querySelectorAll('#page-book .tab-btn').forEach((t, i) => t.classList.toggle('active', i === idx));
  renderSlots();
}
function changeDay(delta) {
  currentDateOffset += delta;
  if (currentDateOffset < 0) currentDateOffset = 0;
  renderSlots();
}

function renderSlots() {
  const el = document.getElementById('slots-container');
  if (!el) return;
  const d = dateFromOffset(currentDateOffset);
  const ds = dateStr(d);
  const labId = LAB_IDS[currentLab];
  const dow = d.getDay();
  const dlEl = document.getElementById('date-label');
  if (dlEl) dlEl.textContent = friendlyDate(d);

  // Weekly limit check
  const wkStart = new Date(d); wkStart.setDate(d.getDate() - d.getDay());
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 7);
  let myCount = 0;
  Object.values(allReservations).forEach(r => {
    if (r.lab_id !== labId || r.reserved_by !== currentUserEmail) return;
    const rd = new Date(r.date_str);
    if (rd >= wkStart && rd < wkEnd && (r.status === 'approved' || r.status === 'pending')) myCount++;
  });
  const atLimit = myCount >= CONFIG.MAX_SLOTS_PER_WEEK;
  const lb = document.getElementById('limit-banner');
  if (lb) {
    lb.textContent = atLimit
      ? `You have ${myCount} active reservations in ${LAB_NAMES[currentLab]} this week. Maximum is ${CONFIG.MAX_SLOTS_PER_WEEK}.`
      : '';
    lb.classList.toggle('vis', atLimit);
  }

  const html = CONFIG.SLOT_START_HOURS.map((h, i) => {
    const key = slotKey(labId, ds, i);
    const res = allReservations[key];
    const sOk = staffAvailable(labId, dow, h);
    const cBlock = classBlocked(labId, dow, h);
    const isMine = res && res.reserved_by === currentUserEmail;

    let badge = '', info = '', action = '';

    if (cBlock) {
      const cls = Object.values(allClasses).find(c =>
        c.lab_id === labId && c.day === dow && h < timeToH(c.end_time || '09:30') && (h + 1.5) > timeToH(c.start_time || '08:00')
      );
      badge = `<span class="badge b-blocked">Class</span>`;
      info  = `<div class="slot-info">Scheduled class${cls ? ' — ' + esc(cls.name) : ''}</div>`;
    } else if (!sOk) {
      badge = `<span class="badge b-blocked">No staff</span>`;
      info  = `<div class="slot-info">No engineer or technician scheduled</div>`;
    } else if (isMine) {
      const sc = res.status === 'approved' ? 'b-approved' : res.status === 'pending' ? 'b-pending' : 'b-rejected';
      const sl = res.status === 'approved' ? 'Approved' : res.status === 'pending' ? 'Pending approval' : 'Rejected';
      badge = `<span class="badge ${sc}">${sl}</span>`;
      info  = `<div class="slot-info"><strong>${esc(res.unit)}</strong> · ${esc(res.section)}<br>IDs: ${esc(res.student_ids)}${res.team_name ? ' · ' + esc(res.team_name) : ''}</div>`;
      if (res.status !== 'rejected') {
        action = `<div class="slot-actions"><button class="btn-cancel-res" onclick="openCancelModal('${key}')">Cancel reservation</button></div>`;
      }
    } else if (res) {
      badge = `<span class="badge b-taken">Reserved</span>`;
      info  = `<div class="slot-info"><strong>${esc(res.unit)}</strong> · ${esc(res.section)}</div>`;
    } else {
      badge = `<span class="badge b-free">Available</span>`;
      if (!atLimit && currentDateOffset >= 0) {
        action = `<div class="slot-actions"><button class="btn-reserve" onclick="openReservationModal(${i})">Request this slot</button></div>`;
      } else if (atLimit) {
        action = `<div class="slot-actions"><button class="btn-reserve" disabled>Weekly limit reached</button></div>`;
      }
    }
    return `<div class="slot-card">
      <div class="slot-head"><div><div class="slot-time">${SLOT_LABELS[i]}</div><div class="slot-dur">1.5 h · ${esc(LAB_NAMES[currentLab])}</div></div>${badge}</div>
      ${info}${action}
    </div>`;
  }).join('');
  el.innerHTML = html;
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
function getMyDecided() {
  return Object.entries(allReservations).filter(([, r]) =>
    r.reserved_by === currentUserEmail && (r.status === 'approved' || r.status === 'rejected')
  );
}
function unreadCount() {
  return getMyDecided().filter(([key]) => !myNotifsSeen[key]).length;
}
function updateNotifBadge() {
  const n = unreadCount();
  const badge = document.getElementById('notif-badge');
  badge.textContent = n > 9 ? '9+' : n;
  badge.classList.toggle('vis', n > 0);
  const pendingN = Object.values(allReservations).filter(r => r.status === 'pending').length;
  document.getElementById('admin-notif-dot').classList.toggle('vis', pendingN > 0);
}
function loadSeen() {
  try { const s = localStorage.getItem('notifsSeen_' + currentUserEmail); if (s) myNotifsSeen = JSON.parse(s); } catch (e) {}
}
function saveSeen() {
  try { localStorage.setItem('notifsSeen_' + currentUserEmail, JSON.stringify(myNotifsSeen)); } catch (e) {}
}
function markRead(key) { myNotifsSeen[key] = Date.now(); saveSeen(); updateNotifBadge(); renderNotifs(); }
function markAllRead() { getMyDecided().forEach(([key]) => { myNotifsSeen[key] = Date.now(); }); saveSeen(); updateNotifBadge(); renderNotifs(); }

function renderNotifs() {
  const pg = document.getElementById('page-notifs');
  const decided = getMyDecided();
  const pending = Object.entries(allReservations).filter(([, r]) => r.reserved_by === currentUserEmail && r.status === 'pending');

  if (!decided.length && !pending.length) {
    pg.innerHTML = `<div class="notifs-panel"><div class="empty">No reservations yet.<br><br><button class="btn-primary" onclick="navigate('book')">Browse schedule →</button></div></div>`;
    return;
  }

  const decidedHtml = decided.map(([key, r]) => {
    const unread = !myNotifsSeen[key];
    const lab = LAB_NAMES[LAB_IDS.indexOf(r.lab_id)] || r.lab_id;
    const approved = r.status === 'approved';
    const noteHtml = r.review_note ? `<div class="notif-note">"${esc(r.review_note)}"</div>` : '';
    return `<div class="notif-card${unread ? ' unread' : ''}">
      <div class="notif-inner">
        <div class="notif-icon ${approved ? 'ni-approved' : 'ni-rejected'}">${approved ? '✅' : '❌'}</div>
        <div class="notif-body">
          <div class="notif-title">${approved ? 'Reservation approved' : 'Reservation rejected'}</div>
          <div class="notif-sub">${esc(lab)} · ${esc(r.date_str)} · ${SLOT_LABELS[r.slot_idx] || ''}<br>${esc(r.unit)} · ${esc(r.section)}</div>
          ${noteHtml}
          <div class="notif-time">${timeAgoStr(r.reviewed_at)}</div>
          ${unread ? `<button class="mark-read-btn" onclick="markRead('${key}')">Mark as read</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  const pendingHtml = pending.map(([key, r]) => {
    const lab = LAB_NAMES[LAB_IDS.indexOf(r.lab_id)] || r.lab_id;
    return `<div class="notif-card">
      <div class="notif-inner">
        <div class="notif-icon ni-pending">⏳</div>
        <div class="notif-body">
          <div class="notif-title">Awaiting approval</div>
          <div class="notif-sub">${esc(lab)} · ${esc(r.date_str)} · ${SLOT_LABELS[r.slot_idx] || ''}<br>${esc(r.unit)} · ${esc(r.section)}</div>
          <div class="notif-time">Submitted ${timeAgoStr(r.submitted_at)}</div>
          <button class="mark-read-btn" style="color:var(--red-text)" onclick="openCancelModal('${key}')">Cancel request</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const unread = unreadCount();
  pg.innerHTML = `<div class="notifs-panel">
    ${decided.length ? `<div class="sec-head" style="padding:16px 0 8px"><span class="sec-label">Decisions</span>${unread > 0 ? `<button class="small-btn" onclick="markAllRead()">Mark all read</button>` : ''}</div>${decidedHtml}` : ''}
    ${pending.length ? `<div class="sec-head" style="padding:16px 0 8px"><span class="sec-label">Pending</span></div>${pendingHtml}` : ''}
  </div>`;
}

// ── RESERVATION submit ────────────────────────────────────────────
function openReservationModal(slotIdx) {
  const d = dateFromOffset(currentDateOffset);
  pendingSlotInfo = { slotIdx, dateStr: dateStr(d), labId: LAB_IDS[currentLab] };
  document.getElementById('res-title').textContent = `Request — ${LAB_NAMES[currentLab]}`;
  document.getElementById('res-sub').textContent = `${friendlyDate(d)} · ${SLOT_LABELS[slotIdx]}`;
  ['unit', 'section', 'ids', 'team'].forEach(f => {
    const el = document.getElementById('r-' + f); if (el) el.value = '';
    const e = document.getElementById('e-' + f); if (e) e.classList.remove('vis');
  });
  document.getElementById('modal-res').classList.remove('hidden');
}

async function submitReservation() {
  if (!pendingSlotInfo) return;
  const unit    = document.getElementById('r-unit').value.trim();
  const section = document.getElementById('r-section').value.trim();
  const ids     = document.getElementById('r-ids').value.trim();
  const team    = document.getElementById('r-team').value.trim();
  document.getElementById('e-unit').classList.toggle('vis', !unit);
  document.getElementById('e-section').classList.toggle('vis', !section);
  document.getElementById('e-ids').classList.toggle('vis', !ids);
  if (!unit || !section || !ids) return;

  const btn = document.getElementById('res-confirm-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  const key = slotKey(pendingSlotInfo.labId, pendingSlotInfo.dateStr, pendingSlotInfo.slotIdx);

  // Check if slot was just taken
  const { data: existing } = await supabase
    .from('reservations').select('id').eq('slot_key', key).maybeSingle();
  if (existing) {
    showToast('Slot just taken — please choose another.');
    closeModal('modal-res');
    btn.disabled = false; btn.textContent = 'Submit request';
    return;
  }

  const { error } = await supabase.from('reservations').insert({
    slot_key: key,
    lab_id: pendingSlotInfo.labId,
    date_str: pendingSlotInfo.dateStr,
    slot_idx: pendingSlotInfo.slotIdx,
    reserved_by: currentUserEmail,
    unit, section,
    student_ids: ids,
    team_name: team,
    status: 'pending',
    submitted_at: new Date().toISOString(),
  });

  if (error) { showToast('Error submitting. Try again.'); }
  else { closeModal('modal-res'); showToast('Request submitted — awaiting approval'); }
  btn.disabled = false; btn.textContent = 'Submit request';
}

// ── Cancel ────────────────────────────────────────────────────────
function openCancelModal(key) { pendingCancelKey = key; document.getElementById('modal-cancel').classList.remove('hidden'); }
async function doCancel() {
  if (!pendingCancelKey) return;
  const { error } = await supabase.from('reservations').delete().eq('slot_key', pendingCancelKey);
  if (error) showToast('Could not cancel. Try again.');
  else showToast('Reservation cancelled');
  closeModal('modal-cancel');
}

// ── ADMIN: tabs ───────────────────────────────────────────────────
function adminTab(name) {
  currentAdminTab = name;
  ['approvals', 'staff', 'classes', 'semester', 'export'].forEach(n => {
    document.getElementById('atab-' + n).classList.toggle('active', n === name);
    document.getElementById('apanel-' + n).style.display = n === name ? '' : 'none';
  });
  if (name === 'approvals') renderApprovals();
  if (name === 'staff')     renderStaffList();
  if (name === 'classes')   renderClassList();
  if (name === 'semester')  renderSemesterForm();
  if (name === 'export')    renderExportPanel();
}

// ── ADMIN: approvals ──────────────────────────────────────────────
function renderApprovals() {
  const pending = Object.entries(allReservations).filter(([, r]) => r.status === 'pending');
  const decided = Object.entries(allReservations)
    .filter(([, r]) => r.status === 'approved' || r.status === 'rejected')
    .sort((a, b) => new Date(b[1].reviewed_at || 0) - new Date(a[1].reviewed_at || 0))
    .slice(0, 30);

  document.getElementById('pending-list').innerHTML = pending.length
    ? pending.map(([key, r]) => {
        const lab = LAB_NAMES[LAB_IDS.indexOf(r.lab_id)] || r.lab_id;
        return `<div class="card">
          <div class="card-row"><div style="flex:1;min-width:0">
            <div class="card-row-label">${esc(r.unit)} · ${esc(r.section)}</div>
            <div class="card-row-sub">${esc(lab)} · ${esc(r.date_str)} · ${SLOT_LABELS[r.slot_idx] || ''}</div>
            <div class="card-row-sub">By: ${esc(r.reserved_by)}</div>
          </div><span class="tag-pending" style="flex-shrink:0">Pending</span></div>
          <div class="card-row" style="justify-content:flex-end">
            <button class="small-btn small-btn-ok" onclick="openApprovalModal('${key}')">Review →</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">No pending requests.</div>';

  document.getElementById('decided-list').innerHTML = decided.length
    ? decided.map(([key, r]) => {
        const lab = LAB_NAMES[LAB_IDS.indexOf(r.lab_id)] || r.lab_id;
        const tag = r.status === 'approved' ? '<span class="tag-approved">Approved</span>' : '<span class="tag-rejected">Rejected</span>';
        return `<div class="card"><div class="card-row">
          <div style="flex:1;min-width:0">
            <div class="card-row-label">${esc(r.unit)} · ${esc(r.section)}</div>
            <div class="card-row-sub">${esc(lab)} · ${esc(r.date_str)} · ${SLOT_LABELS[r.slot_idx] || ''}</div>
            ${r.review_note ? `<div class="card-row-sub">"${esc(r.review_note)}"</div>` : ''}
          </div>${tag}
        </div></div>`;
      }).join('')
    : '<div class="empty">No decisions yet.</div>';
}

function openApprovalModal(key) {
  pendingApprovalKey = key;
  const r = allReservations[key]; if (!r) return;
  const lab = LAB_NAMES[LAB_IDS.indexOf(r.lab_id)] || r.lab_id;
  document.getElementById('appr-sub').textContent = `${lab} · ${r.date_str} · ${SLOT_LABELS[r.slot_idx] || ''}`;
  document.getElementById('appr-details').innerHTML = `
    <div class="detail-row"><span class="detail-label">Unit</span><span class="detail-val">${esc(r.unit)}</span></div>
    <div class="detail-row"><span class="detail-label">Section</span><span class="detail-val">${esc(r.section)}</span></div>
    <div class="detail-row"><span class="detail-label">Student IDs</span><span class="detail-val">${esc(r.student_ids)}</span></div>
    ${r.team_name ? `<div class="detail-row"><span class="detail-label">Team</span><span class="detail-val">${esc(r.team_name)}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">Requested by</span><span class="detail-val">${esc(r.reserved_by)}</span></div>
    <div class="detail-row"><span class="detail-label">Submitted</span><span class="detail-val">${timeAgoStr(r.submitted_at)}</span></div>`;
  document.getElementById('appr-note').value = '';
  document.getElementById('modal-approve').classList.remove('hidden');
}

async function decideReservation(decision) {
  if (!pendingApprovalKey) return;
  const note = document.getElementById('appr-note').value.trim();
  const { error } = await supabase.from('reservations')
    .update({ status: decision, review_note: note, reviewed_at: new Date().toISOString() })
    .eq('slot_key', pendingApprovalKey);
  if (error) { showToast('Error. Try again.'); return; }
  closeModal('modal-approve');
  showToast(`Reservation ${decision}`);
}

// ── ADMIN: staff ──────────────────────────────────────────────────
function renderStaffList() {
  const entries = Object.entries(allStaff);
  document.getElementById('staff-list').innerHTML = entries.length
    ? entries.map(([id, s]) => {
        const days = s.days ? s.days.map(d => DAYS[d].slice(0, 2)).join(' ') : '—';
        const lab = LAB_NAMES[LAB_IDS.indexOf(s.lab_id)] || s.lab_id;
        return `<div class="card"><div class="card-row">
          <div style="flex:1;min-width:0">
            <div class="card-row-label">${esc(s.name)}</div>
            <div class="card-row-sub">${s.role === 'engineer' ? 'Lab Engineer' : 'Technician'} · ${esc(lab)}</div>
            <div class="card-row-sub">${days} · ${s.start_time || '08:00'}–${s.end_time || '17:00'}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <button class="small-btn" onclick="openStaffModal('${id}')">Edit</button>
            <button class="small-btn small-btn-danger" onclick="deleteStaff('${id}')">Delete</button>
          </div>
        </div></div>`;
      }).join('')
    : '<div class="empty">No staff added yet.<br>Add lab engineers and technicians to enable slot availability.</div>';
}

function toggleDay(el) { el.classList.toggle('on'); el.classList.toggle('off'); }

function openStaffModal(id) {
  editingStaffId = id || null;
  document.getElementById('staff-modal-title').textContent = id ? 'Edit staff member' : 'Add staff member';
  const s = id ? allStaff[id] : {};
  document.getElementById('sf-name').value  = s.name || '';
  document.getElementById('sf-role').value  = s.role || 'engineer';
  document.getElementById('sf-lab').value   = s.lab_id || 'lab-a';
  document.getElementById('sf-start').value = s.start_time || '08:00';
  document.getElementById('sf-end').value   = s.end_time || '17:00';
  const days = s.days || [1, 2, 3, 4, 5];
  document.querySelectorAll('#sf-days .day-cell').forEach(el => {
    const d = parseInt(el.dataset.day);
    el.classList.toggle('on', days.includes(d));
    el.classList.toggle('off', !days.includes(d));
  });
  document.getElementById('e-sfname').classList.remove('vis');
  document.getElementById('modal-staff').classList.remove('hidden');
}

async function saveStaff() {
  const name = document.getElementById('sf-name').value.trim();
  document.getElementById('e-sfname').classList.toggle('vis', !name);
  if (!name) return;
  const days = [];
  document.querySelectorAll('#sf-days .day-cell.on').forEach(el => days.push(parseInt(el.dataset.day)));
  const data = {
    name, role: document.getElementById('sf-role').value,
    lab_id: document.getElementById('sf-lab').value, days,
    start_time: document.getElementById('sf-start').value,
    end_time: document.getElementById('sf-end').value,
  };
  const { error } = editingStaffId
    ? await supabase.from('staff').update(data).eq('id', editingStaffId)
    : await supabase.from('staff').insert(data);
  if (error) { showToast('Error saving.'); return; }
  closeModal('modal-staff'); showToast('Staff saved');
}

async function deleteStaff(id) {
  if (!confirm('Delete this staff member?')) return;
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) showToast('Error.'); else showToast('Deleted');
}

// ── ADMIN: classes ────────────────────────────────────────────────
function renderClassList() {
  const entries = Object.entries(allClasses);
  document.getElementById('class-list').innerHTML = entries.length
    ? entries.map(([id, c]) => {
        const lab = LAB_NAMES[LAB_IDS.indexOf(c.lab_id)] || c.lab_id;
        return `<div class="card"><div class="card-row">
          <div style="flex:1;min-width:0">
            <div class="card-row-label">${esc(c.name)}</div>
            <div class="card-row-sub">${esc(lab)} · ${DAYS[c.day] || '?'} · ${c.start_time}–${c.end_time}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <button class="small-btn" onclick="openClassModal('${id}')">Edit</button>
            <button class="small-btn small-btn-danger" onclick="deleteClass('${id}')">Delete</button>
          </div>
        </div></div>`;
      }).join('')
    : '<div class="empty">No class blocks added.<br>Classes block those time slots for all students.</div>';
}

function openClassModal(id) {
  editingClassId = id || null;
  document.getElementById('class-modal-title').textContent = id ? 'Edit class block' : 'Add class block';
  const c = id ? allClasses[id] : {};
  document.getElementById('cl-name').value  = c.name || '';
  document.getElementById('cl-lab').value   = c.lab_id || 'lab-a';
  document.getElementById('cl-day').value   = c.day !== undefined ? c.day : 1;
  document.getElementById('cl-start').value = c.start_time || '08:00';
  document.getElementById('cl-end').value   = c.end_time || '09:30';
  document.getElementById('e-clname').classList.remove('vis');
  document.getElementById('modal-class').classList.remove('hidden');
}

async function saveClass() {
  const name = document.getElementById('cl-name').value.trim();
  document.getElementById('e-clname').classList.toggle('vis', !name);
  if (!name) return;
  const data = {
    name, lab_id: document.getElementById('cl-lab').value,
    day: parseInt(document.getElementById('cl-day').value),
    start_time: document.getElementById('cl-start').value,
    end_time: document.getElementById('cl-end').value,
  };
  const { error } = editingClassId
    ? await supabase.from('classes').update(data).eq('id', editingClassId)
    : await supabase.from('classes').insert(data);
  if (error) { showToast('Error saving.'); return; }
  closeModal('modal-class'); showToast('Class block saved');
}

async function deleteClass(id) {
  if (!confirm('Delete this class block?')) return;
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) showToast('Error.'); else showToast('Deleted');
}

// ── ADMIN: semester ───────────────────────────────────────────────
function renderSemesterForm() {
  document.getElementById('sem-name').value  = semesterData.name || '';
  document.getElementById('sem-start').value = semesterData.start_date || '';
  document.getElementById('sem-end').value   = semesterData.end_date || '';
}
async function saveSemester() {
  const data = {
    id: 1,
    name: document.getElementById('sem-name').value.trim(),
    start_date: document.getElementById('sem-start').value,
    end_date: document.getElementById('sem-end').value,
  };
  const { error } = await supabase.from('semester').upsert(data);
  if (error) showToast('Error saving.'); else showToast('Semester saved');
}

// ── ADMIN: export ─────────────────────────────────────────────────
function renderExportPanel() {
  const vals = Object.values(allReservations);
  const total    = vals.length;
  const approved = vals.filter(r => r.status === 'approved').length;
  const pending  = vals.filter(r => r.status === 'pending').length;
  const rejected = vals.filter(r => r.status === 'rejected').length;
  document.getElementById('export-summary').innerHTML = `
    <div class="card">
      <div class="card-row"><div class="card-row-label">Total reservations</div><strong>${total}</strong></div>
      <div class="card-row"><div class="card-row-label">Approved</div><strong style="color:var(--green-text)">${approved}</strong></div>
      <div class="card-row"><div class="card-row-label">Pending</div><strong style="color:var(--amber-text)">${pending}</strong></div>
      <div class="card-row"><div class="card-row-label">Rejected</div><strong style="color:var(--red-text)">${rejected}</strong></div>
    </div>`;
}
function exportCSV(filter) {
  const rows = Object.entries(allReservations).filter(([, r]) => filter === 'all' || r.status === filter);
  if (!rows.length) { showToast('No data to export.'); return; }
  const header = 'Date,Lab,Slot,Status,Unit,Section,Student IDs,Team,Requested By,Submitted,Reviewed,Note';
  const lines = rows.map(([, r]) => [
    r.date_str, LAB_NAMES[LAB_IDS.indexOf(r.lab_id)] || r.lab_id,
    SLOT_LABELS[r.slot_idx] || '', r.status, r.unit, r.section,
    `"${r.student_ids}"`, r.team_name || '', r.reserved_by,
    r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '',
    r.reviewed_at  ? new Date(r.reviewed_at).toLocaleString()  : '',
    `"${r.review_note || ''}"`
  ].join(','));
  const csv  = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `lab-reservations-${filter}-${dateStr(new Date())}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV downloaded');
}

// ── Data loading ──────────────────────────────────────────────────
async function loadAllData() {
  const [resData, staffData, classData, semData] = await Promise.all([
    supabase.from('reservations').select('*'),
    supabase.from('staff').select('*'),
    supabase.from('classes').select('*'),
    supabase.from('semester').select('*').eq('id', 1).maybeSingle(),
  ]);

  allReservations = {};
  (resData.data || []).forEach(r => { allReservations[r.slot_key] = r; });

  allStaff = {};
  (staffData.data || []).forEach(s => { allStaff[s.id] = s; });

  allClasses = {};
  (classData.data || []).forEach(c => { allClasses[c.id] = c; });

  semesterData = semData.data || {};

  updateNotifBadge();
  if (currentPage === 'home')   renderHome();
  if (currentPage === 'book')   renderSlots();
  if (currentPage === 'notifs') renderNotifs();

  const adminVisible = document.getElementById('admin-view').style.display !== 'none';
  if (adminVisible) {
    if (currentAdminTab === 'approvals') renderApprovals();
    if (currentAdminTab === 'export')    renderExportPanel();
  }
}

function subscribeToChanges() {
  supabase.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadAllData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, loadAllData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, loadAllData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'semester' }, loadAllData)
    .subscribe();
}

// ── INIT ──────────────────────────────────────────────────────────
async function startApp(user) {
  currentUser      = user;
  currentUserEmail = user.email;
  isAdmin          = CONFIG.ADMIN_EMAILS.includes(currentUserEmail);

  loadSeen();

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = '';

  if (isAdmin) {
    document.getElementById('admin-toggle-btn').style.display = '';
  }

  await loadAllData();
  subscribeToChanges();
  navigate('home');
}

async function init() {
  // Handle magic link token in URL (Supabase puts it in the hash)
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    await startApp(session.user);
    return;
  }

  // Listen for auth state changes (magic link click)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
      await startApp(session.user);
    }
  });

  // Show auth screen
  document.getElementById('auth-screen').style.display = 'flex';
}

init();
