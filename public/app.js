/* Company Travel Tracker - vanilla JS single-page site
   Backend: Cloudflare Pages Functions + D1
*/
const api = {
  async get(path){ return req(path, {method:'GET'}); },
  async post(path, body){ return req(path, {method:'POST', body: JSON.stringify(body)}); },
  async put(path, body){ return req(path, {method:'PUT', body: JSON.stringify(body)}); },
  async del(path){ return req(path, {method:'DELETE'}); },
};

async function req(path, opts){
  const res = await fetch(path, {
    headers: {'Content-Type':'application/json'},
    credentials:'include',
    ...opts
  });
  const txt = await res.text();
  let data;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = {ok:false, error: txt}; }
  if(!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const $ = (sel)=>document.querySelector(sel);
const view = $('#view');
const toastEl = $('#toast');
const authStatus = $('#authStatus');
const logoutBtn = $('#logoutBtn');
let bookingsView = 'list';
let bookingsMonth = new Date();

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  setTimeout(()=>toastEl.classList.add('hidden'), 2400);
}

function fmtMoney(n){
  if(n===null||n===undefined||n===''||Number.isNaN(Number(n))) return 'N/A';
  const v = Number(n);
  return v.toLocaleString(undefined,{style:'currency',currency:'USD'});
}
function fmtCashWithCurrency(amount, currency){
  if(amount===null||amount===undefined||amount===''||Number.isNaN(Number(amount))) return 'N/A';
  const value = Number(amount);
  if(currency === 'USD'){
    return value.toLocaleString(undefined, {style:'currency', currency:'USD'});
  }
  return `${currency} ${value.toLocaleString()}`;
}
function fmtMilesWithFees(miles, fees, currency){
  if(miles===null||miles===undefined||miles===''||Number.isNaN(Number(miles))) return 'N/A';
  const milesText = Number(miles).toLocaleString();
  const feeText = fmtCashWithCurrency(fees, currency || 'USD');
  return `${milesText}/${feeText}`;
}
function fmtDateOnly(s){
  if(!s) return '—';
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d = new Date(s);
    if(String(d)!=='Invalid Date'){
      return d.toLocaleDateString();
    }
    return s.slice(0,10);
  }
  const d = new Date(s);
  if(String(d)==='Invalid Date') return s;
  return d.toLocaleDateString();
}
function parseBookingDate(value, fallbackDate){
  if(!value) return null;
  if(/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  if(/^\d{1,2}:\d{2}/.test(value) && fallbackDate){
    return new Date(`${fallbackDate}T${value}:00`);
  }
  const d = new Date(value);
  return String(d)==='Invalid Date' ? null : d;
}
function fmtDateTime(s){
  if(!s) return '—';
  const d = new Date(s);
  if(String(d)==='Invalid Date') return s;
  return d.toLocaleString();
}
function formatTimeInput(s){
  if(!s) return '';
  const match = s.match(/T(\d{2}:\d{2})/);
  if(match) return match[1];
  const clock = s.match(/^(\d{1,2}:\d{2})/);
  if(clock) return clock[1].padStart(5, '0');
  return s;
}
function segmentDateTime(seg, field){
  const value = seg?.[field];
  if(!value) return null;
  if(/^\d{4}-\d{2}-\d{2}/.test(value)){
    const d = new Date(value);
    return String(d)==='Invalid Date' ? null : d;
  }
  if(seg.flight_date && /^\d{1,2}:\d{2}/.test(value)){
    const d = new Date(`${seg.flight_date}T${value}:00`);
    return String(d)==='Invalid Date' ? null : d;
  }
  return null;
}
function hoursBetween(a,b){
  if(!a||!b) return null;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if(String(da)==='Invalid Date'||String(db)==='Invalid Date') return null;
  return (db-da)/36e5;
}
function sortSegmentsByTime(segs){
  return segs.slice().sort((a,b)=>{
    const da = segmentDateTime(a, 'sched_departure')?.getTime() ?? new Date(a.flight_date).getTime();
    const db = segmentDateTime(b, 'sched_departure')?.getTime() ?? new Date(b.flight_date).getTime();
    return da-db;
  });
}
function groupSegmentsByLabel(segs){
  const groups = new Map();
  segs.forEach(seg=>{
    const label = seg.segment_group || 'Outbound';
    if(!groups.has(label)) groups.set(label, []);
    groups.get(label).push(seg);
  });
  return Array.from(groups.entries()).map(([label, items])=>({
    label,
    segments: sortSegmentsByTime(items)
  }));
}
function computeGroupFirstDeparture(group){
  const first = group.segments[0];
  if(!first) return null;
  return segmentDateTime(first, 'sched_departure') || parseBookingDate(first.flight_date);
}
function computeLayoversForSegments(segs){
  const out=[];
  for(let i=0;i<segs.length-1;i++){
    const h = hoursBetween(
      segmentDateTime(segs[i], 'sched_arrival'),
      segmentDateTime(segs[i+1], 'sched_departure')
    );
    if(h===null){ out.push('—'); continue; }
    out.push(h<0?'—':(h<24?`${h.toFixed(1)}h`:`${Math.round(h)}h`));
  }
  return out;
}
function dateKeyFromDate(date){
  if(!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function formatSegmentClock(value){
  if(!value) return '';
  if(/^\d{2}:\d{2}/.test(value)) return value;
  const match = value.match(/T(\d{2}:\d{2})/);
  if(match) return match[1];
  return value;
}

const AIRLINE_MAP = {
  UA: 'United',
  AA: 'American',
  DL: 'Delta',
  WN: 'Southwest',
  B6: 'JetBlue',
  AS: 'Alaska',
  NK: 'Spirit',
  F9: 'Frontier',
  AC: 'Air Canada',
  BA: 'British Airways',
  VS: 'Virgin Atlantic',
  LH: 'Lufthansa',
  AF: 'Air France',
  KL: 'KLM',
  QR: 'Qatar Airways',
  EK: 'Emirates',
  EY: 'Etihad',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  AI: 'Air India'
};

function airlineNameFromFlightNumber(flightNumber, fallback){
  if(fallback) return fallback;
  const match = (flightNumber || '').match(/^[A-Za-z]{2,3}/);
  if(!match) return '—';
  const code = match[0].toUpperCase();
  return AIRLINE_MAP[code] || code;
}

async function ensureAuthed(){
  try{
    const me = await api.get('/api/me');
    authStatus.textContent = `Logged in`;
    logoutBtn.classList.remove('hidden');
    return true;
  }catch{
    authStatus.textContent = `Locked`;
    logoutBtn.classList.add('hidden');
    return false;
  }
}

logoutBtn?.addEventListener('click', async ()=>{
  try{ await api.post('/api/logout', {});}catch{}
  location.hash = '#/login';
});

function setActiveNav(){
  const hash = location.hash || '#/bookings';
  document.querySelectorAll('.nav a').forEach(a=>{
    a.classList.toggle('active', hash.startsWith(a.getAttribute('href')));
  });
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

async function router(){
  setActiveNav();
  const authed = await ensureAuthed();
  const hash = location.hash || '#/bookings';
  const route = hash.replace(/^#\//,'').split('/');
  const page = route[0] || 'bookings';

  if(!authed && page !== 'login'){
    location.hash = '#/login';
    return;
  }

  if(page === 'login') return renderLogin();
  if(page === 'bookings') return renderBookings();
  if(page === 'new') return renderNewBooking();
  if(page === 'booking') return renderBookingDetail(route[1]);
  if(page === 'dashboard') return renderDashboard();
  if(page === 'admin') return renderAdmin();
  view.innerHTML = '<div class="card"><h1>Not found</h1></div>';
}

function renderLogin(){
  view.innerHTML = `
    <div class="card" style="max-width:520px;margin:30px auto;">
      <h1>Enter password</h1>
      <p class="muted">This site is locked.</p>
      <div class="grid">
        <div>
          <label>Password</label>
          <input id="pw" type="password" placeholder="••••••••"/>
        </div>
        <button id="loginBtn" class="btn btn-primary">Login</button>
        <p class="small muted">Tip: your password is stored server-side (not in this webpage).</p>
      </div>
    </div>
  `;
  $('#loginBtn').addEventListener('click', async ()=>{
    const password = $('#pw').value.trim();
    if(!password) return toast('Enter a password');
    try{
      await api.post('/api/login', {password});
      toast('Unlocked');
      location.hash = '#/bookings';
    }catch(e){
      toast(e.message || 'Login failed');
    }
  });
}

/* BOOKINGS LIST */
async function renderBookings(){
  const people = (await api.get('/api/people')).people || [];
  view.innerHTML = `
    <div class="row">
      <h1 class="spacer">Bookings</h1>
      <div class="row">
        <button id="viewList" class="btn btn-ghost">List</button>
        <button id="viewCalendar" class="btn btn-ghost">Calendar</button>
      </div>
      <a class="btn btn-primary" href="#/new">+ New booking</a>
    </div>
    <div class="card">
      <div class="row">
        <div style="min-width:220px;flex:1">
          <label>Search (person, route, flight #, reason)</label>
          <input id="q" placeholder="e.g. VS45 or Bombay or trade show"/>
        </div>
        <div style="min-width:200px">
          <label>Person</label>
          <select id="person_filter"><option value="">All</option></select>
        </div>
        <div style="min-width:180px">
          <label>Status</label>
          <select id="status">
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Canceled">Canceled (any traveler)</option>
          </select>
        </div>
        <div style="min-width:160px">
          <label class="checkbox">
            <input id="showFlown" type="checkbox"/>
            Show flown
          </label>
        </div>
        <button id="refresh" class="btn">Refresh</button>
      </div>
      <div class="hr"></div>
      <div id="list" class="small muted">Loading…</div>
    </div>
  `;
  const personFilter = $('#person_filter');
  personFilter.innerHTML = '<option value="">All</option>' + people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const viewListBtn = $('#viewList');
  const viewCalendarBtn = $('#viewCalendar');
  function syncViewButtons(){
    viewListBtn.classList.toggle('btn-primary', bookingsView === 'list');
    viewCalendarBtn.classList.toggle('btn-primary', bookingsView === 'calendar');
  }
  syncViewButtons();
  async function load(){
    const q = $('#q').value.trim();
    const status = $('#status').value;
    const person_id = personFilter.value || '';
    const showFlown = $('#showFlown').checked;
    const data = await api.get(`/api/bookings?`+new URLSearchParams({q,status,person_id}).toString());
    const rows = (data.bookings || []).slice();
    if(!rows.length){
      $('#list').innerHTML = '<div class="muted">No bookings found.</div>';
      return;
    }
    const groupEntries = buildGroupEntries(rows).filter(entry=>showFlown || !isFlown(entry));
    if(bookingsView === 'calendar'){
      renderCalendar(groupEntries);
    }else{
      renderList(groupEntries);
    }
  }
  function buildGroupEntries(rows){
    const entries = [];
    rows.forEach(b=>{
      const groups = groupSegmentsByLabel(b.segments || []);
      const baseGroups = groups.length ? groups : [{ label: 'Outbound', segments: [] }];
      baseGroups.forEach(group=>{
        const first = computeGroupFirstDeparture(group);
        const travelers = b.traveler_details?.length
          ? b.traveler_details
          : [{ name: '—', pnr: '', reason: '', status: '' }];
        entries.push({
          booking: b,
          group,
          first_departure: first,
          travelers
        });
      });
    });
    entries.sort((a,b)=>{
      const ta = a.first_departure ? a.first_departure.getTime() : Number.POSITIVE_INFINITY;
      const tb = b.first_departure ? b.first_departure.getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
    return entries;
  }
  function isFlown(entry){
    if(!entry.first_departure) return false;
    const today = new Date();
    today.setHours(0,0,0,0);
    return entry.first_departure < today;
  }
  function renderList(entries){
    $('#list').innerHTML = `
      <div class="booking-list">
        <div class="booking-summary-grid booking-header">
          <div>Trip</div>
          <div>Traveler</div>
          <div>PNR</div>
          <div>Payment</div>
          <div>Type</div>
          <div>Notes</div>
          <div>Status</div>
        </div>
        ${entries.flatMap(entry=>{
          const b = entry.booking;
          const group = entry.group;
          const payment = b.payment_type === 'Miles'
            ? fmtMilesWithFees(b.cost_miles, b.fees, b.currency)
            : fmtCashWithCurrency(b.cost_cash, b.currency);
          const statusBadge = b.any_canceled ? '<span class="badge warn">Has canceled</span>' : '<span class="badge ok">OK</span>';
          const groupLabel = b.booking_type === 'Roundtrip' ? group.label : 'Trip';
          const departDate = entry.first_departure ? entry.first_departure.toLocaleDateString() : '—';
          const firstSeg = group.segments[0] || {};
          const lastSeg = group.segments[group.segments.length - 1] || {};
          const routeLabel = `${firstSeg.origin || '—'} → ${lastSeg.destination || '—'}`;
          const tripMeta = `${groupLabel} • ${departDate}`;
          return entry.travelers.map(t=>{
            const travelerStatus = t.status === 'Canceled' ? '<span class="badge danger">Canceled</span>' : statusBadge;
            return `
              <details class="booking-accordion" data-id="${b.id}">
                <summary class="booking-summary">
                  <div class="booking-summary-grid">
                    <div>
                      <div class="booking-trip">${escapeHtml(routeLabel)}</div>
                      <div class="booking-trip-meta muted small">${escapeHtml(tripMeta)}</div>
                    </div>
                    <div>${escapeHtml(t.name || '—')}</div>
                    <div>${escapeHtml(t.pnr || '—')}</div>
                    <div>${escapeHtml(payment)}</div>
                    <div>${escapeHtml(b.booking_type || '—')}</div>
                    <div>${escapeHtml(t.reason || '—')}</div>
                    <div>${travelerStatus}</div>
                  </div>
                </summary>
                <div class="booking-accordion-body">
                  <div class="segment-strip">
                    <div class="segment-strip-legs">
                      ${renderSegmentLegs(group.segments)}
                    </div>
                  </div>
                  <div class="booking-meta muted small">Booking #${escapeHtml(String(b.id))} • ${escapeHtml(b.route || '—')}</div>
                  <div class="booking-actions">
                    <button class="btn" data-open-booking="${b.id}">Open booking</button>
                  </div>
                </div>
              </details>
            `;
          });
        }).join('')}
      </div>
    `;
    document.querySelectorAll('[data-open-booking]').forEach(btn=>{
      btn.addEventListener('click', (event)=>{
        event.stopPropagation();
        const id = btn.dataset.openBooking;
        location.hash = `#/booking/${id}`;
      });
    });
  }
  function renderSegmentLegs(segments){
    if(!segments.length) return '<div class="segment-strip-leg">No segments</div>';
    const layovers = computeLayoversForSegments(segments);
    return segments.map((s,i)=>{
      const airline = airlineNameFromFlightNumber(s.flight_number, s.airline);
      const departTime = formatSegmentClock(s.sched_departure);
      const arriveTime = formatSegmentClock(s.sched_arrival);
      const timeLabel = departTime || arriveTime ? `${departTime || '—'} → ${arriveTime || '—'}` : '—';
      const dateLabel = s.flight_date ? fmtDateOnly(s.flight_date) : '—';
      return `
        <div class="segment-strip-leg">
          <div class="segment-strip-route">${escapeHtml(s.origin || '—')} → ${escapeHtml(s.destination || '—')}</div>
          <div class="segment-strip-meta">${escapeHtml(airline)} ${escapeHtml(s.flight_number || '')} • ${escapeHtml(dateLabel)}</div>
          <div class="segment-strip-meta">${escapeHtml(timeLabel)}</div>
        </div>
        ${i < layovers.length ? `<div class="segment-strip-layover">Layover ${escapeHtml(layovers[i])}</div>` : ''}
      `;
    }).join('');
  }
  function renderCalendar(entries){
    const month = new Date(bookingsMonth.getFullYear(), bookingsMonth.getMonth(), 1);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const monthLabel = month.toLocaleString(undefined, {month:'long', year:'numeric'});
    const startDay = month.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const itemsByDate = new Map();
    entries.forEach(entry=>{
      const b = entry.booking;
      const firstDeparture = entry.first_departure;
      const dateKey = firstDeparture ? dateKeyFromDate(firstDeparture) : '';
      if(!dateKey) return;
      const group = entry.group;
      const firstSeg = group.segments[0] || {};
      const airline = airlineNameFromFlightNumber(firstSeg.flight_number, firstSeg.airline);
      const groupLabel = b.booking_type === 'Roundtrip' ? group.label : 'Trip';
      entry.travelers.forEach(t=>{
        const label = `${t.name || '—'} • ${groupLabel} • ${airline} ${firstSeg.flight_number || ''} ${firstSeg.origin || '—'}→${firstSeg.destination || '—'}`.trim();
        const items = itemsByDate.get(dateKey) || [];
        items.push({ id: b.id, label });
        itemsByDate.set(dateKey, items);
      });
    });
    const cells = [];
    for(let i=0;i<startDay;i++){
      cells.push('<div class="calendar-cell muted"></div>');
    }
    for(let day=1; day<=daysInMonth; day++){
      const dateKey = `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const items = itemsByDate.get(dateKey) || [];
      cells.push(`
        <div class="calendar-cell">
          <div class="calendar-date">${day}</div>
          <div class="calendar-items">
            ${items.map(item=>`<div class="calendar-item" data-id="${item.id}">${escapeHtml(item.label)}</div>`).join('')}
          </div>
        </div>
      `);
    }
    $('#list').innerHTML = `
      <div class="calendar">
        <div class="row calendar-toolbar">
          <button id="calPrev" class="btn btn-ghost">◀</button>
          <div class="spacer"><strong>${escapeHtml(monthLabel)}</strong></div>
          <button id="calNext" class="btn btn-ghost">▶</button>
        </div>
        <div class="calendar-grid">
          ${dayHeaders.map(d=>`<div class="calendar-header-cell">${d}</div>`).join('')}
          ${cells.join('')}
        </div>
      </div>
    `;
    document.querySelectorAll('.calendar-item').forEach(item=>{
      item.addEventListener('click', ()=>{
        const id = item.dataset.id;
        location.hash = `#/booking/${id}`;
      });
    });
    $('#calPrev').addEventListener('click', ()=>{
      bookingsMonth = new Date(year, monthIndex - 1, 1);
      load().catch(e=>toast(e.message));
    });
    $('#calNext').addEventListener('click', ()=>{
      bookingsMonth = new Date(year, monthIndex + 1, 1);
      load().catch(e=>toast(e.message));
    });
  }
  $('#refresh').addEventListener('click', ()=>load().catch(e=>toast(e.message)));
  $('#q').addEventListener('keydown', (e)=>{ if(e.key==='Enter') load().catch(err=>toast(err.message)); });
  $('#status').addEventListener('change', ()=>load().catch(e=>toast(e.message)));
  $('#person_filter').addEventListener('change', ()=>load().catch(e=>toast(e.message)));
  $('#showFlown').addEventListener('change', ()=>load().catch(e=>toast(e.message)));
  viewListBtn.addEventListener('click', ()=>{
    bookingsView = 'list';
    syncViewButtons();
    load().catch(e=>toast(e.message));
  });
  viewCalendarBtn.addEventListener('click', ()=>{
    bookingsView = 'calendar';
    syncViewButtons();
    load().catch(e=>toast(e.message));
  });
  load().catch(e=>toast(e.message));
}

/* NEW BOOKING */
async function renderNewBooking(){
  const people = (await api.get('/api/people')).people || [];
  view.innerHTML = `
    <div class="row">
      <h1 class="spacer">New booking</h1>
      <a class="btn" href="#/bookings">Back</a>
    </div>

    <div class="grid two">
      <div class="card">
        <h2>Booking basics</h2>
        <div class="grid two">
          <div>
            <label>Booking type</label>
            <select id="booking_type">
              <option>Roundtrip</option>
              <option>One-way</option>
              <option>Multi-city</option>
            </select>
          </div>
          <div>
            <label>Payment type</label>
            <select id="payment_type">
              <option>Cash</option>
              <option>Miles</option>
            </select>
          </div>
          <div id="cashWrap">
            <label>Cost (cash)</label>
            <input id="cost_cash" type="number" step="0.01" placeholder="e.g. 1240.50"/>
          </div>
          <div id="milesWrap" class="hidden">
            <label>Miles used</label>
            <input id="cost_miles" type="number" step="1" placeholder="e.g. 85000"/>
          </div>
          <div id="feesWrap" class="hidden">
            <label>Fees (award)</label>
            <input id="fees" type="number" step="0.01" placeholder="e.g. 178.40"/>
          </div>
          <div>
            <label>Currency (optional)</label>
            <input id="currency" placeholder="USD"/>
          </div>
          <div>
            <label>Class</label>
            <input id="class" placeholder="e.g. Premium / J / Y"/>
          </div>
          <div>
            <label>Secondary class</label>
            <input id="secondary_class" placeholder="optional"/>
          </div>
          <div>
            <label>Ticket end date (optional)</label>
            <input id="ticket_end" type="date"/>
          </div>
          <div>
            <label>Issued on (optional)</label>
            <input id="issued_on" type="date"/>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Travelers</h2>
        <p class="muted small">Select travelers for this booking. You’ll enter a PNR + reason/category for each traveler.</p>
        <div class="grid">
          <div>
            <label>Travelers</label>
            <select id="traveler_select" multiple size="${Math.min(10, Math.max(4, people.length))}">
              ${people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div id="travelerCards"></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="row">
        <h2 class="spacer">Segments</h2>
      </div>
      <p class="muted small">Enter flight number + date, then fetch to auto-fill. You can edit anything.</p>
      <div class="segment-group-card">
        <div class="row">
          <h3 class="spacer">Outbound</h3>
          <button id="addOutboundSeg" class="btn">+ Add segment</button>
        </div>
        <div id="segmentsOutbound"></div>
        <div class="muted small" id="outboundHint"></div>
      </div>
      <div id="returnGroup" class="segment-group-card" style="margin-top:14px">
        <div class="row">
          <h3 class="spacer">Return</h3>
          <button id="addReturnSeg" class="btn">+ Add segment</button>
        </div>
        <div id="segmentsReturn"></div>
        <div class="muted small" id="returnHint"></div>
      </div>
      <div class="hr"></div>
      <div class="row">
        <button id="saveBooking" class="btn btn-primary">Save booking</button>
        <span class="muted small" id="saveHint"></span>
      </div>
    </div>
  `;

  const paymentTypeEl = $('#payment_type');
  function syncPaymentUI(){
    const t = paymentTypeEl.value;
    if(t==='Cash'){
      $('#cashWrap').classList.remove('hidden');
      $('#milesWrap').classList.add('hidden');
      $('#feesWrap').classList.add('hidden');
    }else{
      $('#cashWrap').classList.add('hidden');
      $('#milesWrap').classList.remove('hidden');
      $('#feesWrap').classList.remove('hidden');
    }
  }
  paymentTypeEl.addEventListener('change', syncPaymentUI);
  syncPaymentUI();

  // traveler per-person fields
  const travelerSelect = $('#traveler_select');
  travelerSelect.addEventListener('change', ()=>{
    const ids = Array.from(travelerSelect.selectedOptions).map(o=>Number(o.value));
    $('#travelerCards').innerHTML = ids.map(id=>{
      const p = people.find(x=>x.id===id);
      return `
        <div class="card" style="margin-top:10px">
          <div class="row">
            <strong>${escapeHtml(p?.name||('Person '+id))}</strong>
            <span class="badge">Per-person</span>
          </div>
          <div class="grid two" style="margin-top:10px">
            <div>
              <label>PNR (required)</label>
              <input data-pnr="${id}" placeholder="e.g. ABC123"/>
            </div>
            <div>
              <label>Category</label>
              <input data-category="${id}" placeholder="e.g. Trade show / Client / Vendor"/>
            </div>
            <div class="two-col" style="grid-column:1 / -1">
              <label>Reason for travel (Notes)</label>
              <textarea data-reason="${id}" placeholder="Why is this trip happening?"></textarea>
            </div>
          </div>
        </div>
      `;
    }).join('');
  });

  // segments
  let segIdx = 0;
  const outboundWrap = $('#segmentsOutbound');
  const returnWrap = $('#segmentsReturn');
  const returnGroup = $('#returnGroup');

  function syncReturnVisibility(){
    const isRoundtrip = $('#booking_type').value === 'Roundtrip';
    returnGroup.classList.toggle('hidden', !isRoundtrip);
    recomputeLayoversHint();
  }
  $('#booking_type').addEventListener('change', syncReturnVisibility);
  syncReturnVisibility();

  $('#addOutboundSeg').addEventListener('click', ()=>addSegment('Outbound', outboundWrap));
  $('#addReturnSeg').addEventListener('click', ()=>addSegment('Return', returnWrap));

  function addSegment(group, container, prefill={}){
    const idx = segIdx++;
    const el = document.createElement('div');
    el.className = 'card';
    el.style.marginTop = '10px';
    el.dataset.seg = String(idx);
    el.dataset.group = group;
    el.innerHTML = `
      <div class="row">
        <strong class="spacer">Segment ${idx+1}</strong>
        <button class="btn btn-danger" data-remove="${idx}">Remove</button>
      </div>
      <div class="grid three" style="margin-top:10px">
        <div>
          <label>Flight number</label>
          <input data-flight="${idx}" placeholder="e.g. VS45" value="${escapeAttr(prefill.flight_number||'')}"/>
        </div>
        <div>
          <label>Flight date</label>
          <input data-date="${idx}" type="date" value="${escapeAttr(prefill.flight_date||'')}"/>
        </div>
        <div style="display:flex;align-items:end;gap:10px">
          <button class="btn" data-fetch="${idx}">Fetch</button>
          <span class="muted small" data-fetchStatus="${idx}"></span>
        </div>

        <div>
          <label>Departure (airport code)</label>
          <input data-origin="${idx}" placeholder="JFK" value="${escapeAttr(prefill.origin||'')}"/>
        </div>
        <div>
          <label>Arrival (airport code)</label>
          <input data-dest="${idx}" placeholder="BOM" value="${escapeAttr(prefill.destination||'')}"/>
        </div>
        <div>
          <label>Aircraft type</label>
          <input data-aircraft="${idx}" placeholder="e.g. A359" value="${escapeAttr(prefill.aircraft_type||'')}"/>
        </div>

        <div>
          <label>Scheduled departure</label>
          <input data-sdep="${idx}" placeholder="auto" value="${escapeAttr(formatTimeInput(prefill.sched_departure||''))}"/>
        </div>
        <div>
          <label>Scheduled arrival</label>
          <input data-sarr="${idx}" placeholder="auto" value="${escapeAttr(formatTimeInput(prefill.sched_arrival||''))}"/>
        </div>
        <div>
          <label>Airline (optional)</label>
          <input data-airline="${idx}" placeholder="auto" value="${escapeAttr(prefill.airline||'')}"/>
        </div>
      </div>
    `;
    container.appendChild(el);

    el.querySelector(`[data-remove="${idx}"]`).addEventListener('click', ()=>{
      el.remove();
      recomputeLayoversHint();
    });

    el.querySelector(`[data-fetch="${idx}"]`).addEventListener('click', async ()=>{
      const flight_number = el.querySelector(`[data-flight="${idx}"]`).value.trim();
      const flight_date = el.querySelector(`[data-date="${idx}"]`).value;
      const statusEl = el.querySelector(`[data-fetchStatus="${idx}"]`);
      if(!flight_number || !flight_date){ toast('Enter flight number + date'); return; }
      statusEl.textContent = 'Fetching…';
      try{
        const r = await api.get('/api/flight-lookup?' + new URLSearchParams({flight_number, flight_date}).toString());
        const f = r.flight;
        el.querySelector(`[data-origin="${idx}"]`).value = f.origin || '';
        el.querySelector(`[data-dest="${idx}"]`).value = f.destination || '';
        el.querySelector(`[data-aircraft="${idx}"]`).value = f.aircraft_type || '';
        el.querySelector(`[data-sdep="${idx}"]`).value = formatTimeInput(f.sched_departure || '');
        el.querySelector(`[data-sarr="${idx}"]`).value = formatTimeInput(f.sched_arrival || '');
        el.querySelector(`[data-airline="${idx}"]`).value = f.airline || '';
        statusEl.textContent = 'Done';
        recomputeLayoversHint();
      }catch(e){
        statusEl.textContent = 'Failed';
        toast(e.message);
      }
    });

    recomputeLayoversHint();
  }

  function recomputeLayoversHint(){
    const outbound = readSegmentsForGroup('Outbound');
    const inbound = readSegmentsForGroup('Return');
    const outboundHint = outbound.length <= 1 ? '' : summarizeLayovers(outbound);
    const inboundHint = inbound.length <= 1 ? '' : summarizeLayovers(inbound);
    $('#outboundHint').textContent = outboundHint ? `Layovers: ${outboundHint}` : '';
    $('#returnHint').textContent = inboundHint ? `Layovers: ${inboundHint}` : '';
  }

  function readSegmentsForGroup(group){
    const wrap = group === 'Return' ? returnWrap : outboundWrap;
    const segCards = Array.from(wrap.querySelectorAll('[data-seg]'));
    const segs = segCards.map(card=>{
      const idx = card.dataset.seg;
      const flight_number = card.querySelector(`[data-flight="${idx}"]`).value.trim();
      const flight_date = card.querySelector(`[data-date="${idx}"]`).value;
      return {
        flight_number,
        flight_date,
        origin: card.querySelector(`[data-origin="${idx}"]`).value.trim() || null,
        destination: card.querySelector(`[data-dest="${idx}"]`).value.trim() || null,
        aircraft_type: card.querySelector(`[data-aircraft="${idx}"]`).value.trim() || null,
        sched_departure: card.querySelector(`[data-sdep="${idx}"]`).value.trim() || null,
        sched_arrival: card.querySelector(`[data-sarr="${idx}"]`).value.trim() || null,
        airline: card.querySelector(`[data-airline="${idx}"]`).value.trim() || null,
        segment_group: group
      };
    }).filter(s=>s.flight_number && s.flight_date);
    return sortSegmentsByTime(segs);
  }

  function readSegments(){
    const outbound = readSegmentsForGroup('Outbound');
    const isRoundtrip = $('#booking_type').value === 'Roundtrip';
    if(!isRoundtrip) return outbound;
    return [...outbound, ...readSegmentsForGroup('Return')];
  }

  function summarizeLayovers(segs){
    const parts=[];
    for(let i=0;i<segs.length-1;i++){
      const h = hoursBetween(
        segmentDateTime(segs[i], 'sched_arrival'),
        segmentDateTime(segs[i+1], 'sched_departure')
      );
      if(h===null) continue;
      const label = h < 0 ? '—' : (h < 24 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`));
      parts.push(label);
    }
    return parts.join(' • ');
  }

  // start with one segment row
  addSegment('Outbound', outboundWrap);

  $('#saveBooking').addEventListener('click', async ()=>{
    try{
      const booking_type = $('#booking_type').value;
      const payment_type = $('#payment_type').value;
      const currency = ($('#currency').value.trim() || 'USD').toUpperCase();

      const cost_cash = $('#cost_cash').value.trim();
      const cost_miles = $('#cost_miles')?.value?.trim() || '';
      const fees = $('#fees')?.value?.trim() || '';

      // validate payment rule
      if(payment_type==='Cash'){
        if(!cost_cash) throw new Error('Cash payment requires Cost (cash).');
      }else{
        if(!cost_miles || !fees) throw new Error('Miles payment requires Miles used + Fees.');
      }

      const segments = readSegments();
      if(!segments.length) throw new Error('Add at least one segment (flight number + date).');

      const traveler_ids = Array.from(travelerSelect.selectedOptions).map(o=>Number(o.value));
      if(!traveler_ids.length) throw new Error('Select at least one traveler.');

      const traveler_entries = traveler_ids.map(id=>({
        person_id: id,
        pnr: (document.querySelector(`[data-pnr="${id}"]`)?.value || '').trim(),
        category: (document.querySelector(`[data-category="${id}"]`)?.value || '').trim(),
        reason: (document.querySelector(`[data-reason="${id}"]`)?.value || '').trim(),
      }));

      for(const t of traveler_entries){
        if(!t.pnr) throw new Error('PNR is required for each traveler.');
      }

      const payload = {
        booking: {
          booking_type,
          payment_type,
          currency,
          cost_cash: cost_cash || null,
          cost_miles: cost_miles || null,
          fees: fees || null,
          class: $('#class').value.trim() || null,
          secondary_class: $('#secondary_class').value.trim() || null,
          ticket_end: $('#ticket_end').value.trim() || null,
          issued_on: $('#issued_on').value || null,
        },
        segments,
        travelers: traveler_entries
      };

      const r = await api.post('/api/bookings', payload);
      toast('Saved');
      location.hash = `#/booking/${r.id}`;
    }catch(e){
      toast(e.message);
    }
  });
}

/* BOOKING DETAIL */
async function renderBookingDetail(id){
  const data = await api.get(`/api/bookings/${encodeURIComponent(id)}`);
  const b = data.booking;
  const segs = data.segments || [];
  const trav = data.travelers || [];

  const route = segs.length ? `${segs[0].origin || '—'} → ${segs[segs.length-1].destination || '—'}` : '—';

  view.innerHTML = `
    <div class="row">
      <h1 class="spacer">Booking <code>#${escapeHtml(String(id))}</code> • ${escapeHtml(route)}</h1>
      <a class="btn" href="#/bookings">Back</a>
    </div>

    <div class="grid two">
      <div class="card">
        <h2>Summary</h2>
        <div class="row" style="margin-top:8px">
          <span class="badge">${escapeHtml(b.booking_type || 'Booking')}</span>
          <span class="badge">${escapeHtml(b.payment_type || '')}</span>
          <span class="badge">${escapeHtml(b.currency || 'USD')}</span>
        </div>
        <div class="hr"></div>
        <div class="grid two">
          <div>
            <label>Cost (cash)</label>
            <div><strong>${b.payment_type==='Cash' ? escapeHtml(String(b.cost_cash ?? 'N/A')) : 'N/A'}</strong></div>
          </div>
          <div>
            <label>Miles + Fees</label>
            <div><strong>${b.payment_type==='Miles' ? escapeHtml(String(b.cost_miles ?? 'N/A'))+' miles + '+escapeHtml(String(b.fees ?? 'N/A')) : 'N/A'}</strong></div>
          </div>
          <div>
            <label>Class</label>
            <div><strong>${escapeHtml(b.class || '—')}</strong></div>
          </div>
          <div>
            <label>Issued on</label>
            <div><strong>${escapeHtml(b.issued_on || '—')}</strong></div>
          </div>
        </div>
        <div class="hr"></div>
        <button id="deleteBooking" class="btn btn-danger">Delete booking (danger)</button>
        <p class="muted small">This is the only destructive action. Tickets cancellation should be used instead.</p>
      </div>

      <div class="card">
        <h2>Travelers</h2>
        <p class="muted small">Cancel a traveler’s ticket without deleting the booking.</p>
        <div id="travList"></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Edit booking</h2>
      <div class="grid two">
        <div>
          <label>Booking type</label>
          <select id="edit_booking_type">
            ${['Roundtrip','One-way','Multi-city'].map(v=>`<option ${b.booking_type===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Payment type</label>
          <select id="edit_payment_type">
            ${['Cash','Miles'].map(v=>`<option ${b.payment_type===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div id="editCashWrap">
          <label>Cost (cash)</label>
          <input id="edit_cost_cash" type="number" step="0.01" value="${escapeAttr(b.cost_cash ?? '')}"/>
        </div>
        <div id="editMilesWrap">
          <label>Miles used</label>
          <input id="edit_cost_miles" type="number" step="1" value="${escapeAttr(b.cost_miles ?? '')}"/>
        </div>
        <div id="editFeesWrap">
          <label>Fees (award)</label>
          <input id="edit_fees" type="number" step="0.01" value="${escapeAttr(b.fees ?? '')}"/>
        </div>
        <div>
          <label>Currency</label>
          <input id="edit_currency" value="${escapeAttr(b.currency || 'USD')}"/>
        </div>
        <div>
          <label>Class</label>
          <input id="edit_class" value="${escapeAttr(b.class || '')}"/>
        </div>
        <div>
          <label>Secondary class</label>
          <input id="edit_secondary_class" value="${escapeAttr(b.secondary_class || '')}"/>
        </div>
        <div>
          <label>Ticket end date</label>
          <input id="edit_ticket_end" type="date" value="${escapeAttr(b.ticket_end || '')}"/>
        </div>
        <div>
          <label>Issued on</label>
          <input id="edit_issued_on" type="date" value="${escapeAttr(b.issued_on || '')}"/>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <h3 class="spacer">Segments</h3>
      </div>
      <div class="segment-group-card">
        <div class="row">
          <strong class="spacer">Outbound</strong>
          <button id="editAddOutboundSeg" class="btn">+ Add segment</button>
        </div>
        <div id="editSegmentsOutbound"></div>
        <div class="muted small" id="editOutboundHint"></div>
      </div>
      <div id="editReturnGroup" class="segment-group-card" style="margin-top:14px">
        <div class="row">
          <strong class="spacer">Return</strong>
          <button id="editAddReturnSeg" class="btn">+ Add segment</button>
        </div>
        <div id="editSegmentsReturn"></div>
        <div class="muted small" id="editReturnHint"></div>
      </div>
      <div class="row" style="margin-top:14px">
        <button id="saveBookingEdit" class="btn btn-primary">Save booking changes</button>
        <span class="muted small" id="editSaveHint"></span>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Segments</h2>
      <div class="hr"></div>
      <div id="segList"></div>
    </div>
  `;

  // ...rest of file unchanged...
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g,' '); }
