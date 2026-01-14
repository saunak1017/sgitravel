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
function fmtDateTime(s){
  if(!s) return '—';
  const d = new Date(s);
  if(String(d)==='Invalid Date') return s;
  return d.toLocaleString();
}
function hoursBetween(a,b){
  if(!a||!b) return null;
  const da=new Date(a), db=new Date(b);
  if(String(da)==='Invalid Date'||String(db)==='Invalid Date') return null;
  return (db-da)/36e5;
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
  view.innerHTML = `
    <div class="row">
      <h1 class="spacer">Bookings</h1>
      <a class="btn btn-primary" href="#/new">+ New booking</a>
    </div>
    <div class="card">
      <div class="row">
        <div style="min-width:220px;flex:1">
          <label>Search (person, route, flight #, reason)</label>
          <input id="q" placeholder="e.g. VS45 or Bombay or trade show"/>
        </div>
        <div style="min-width:180px">
          <label>Status</label>
          <select id="status">
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Canceled">Canceled (any traveler)</option>
          </select>
        </div>
        <button id="refresh" class="btn">Refresh</button>
      </div>
      <div class="hr"></div>
      <div id="list" class="small muted">Loading…</div>
    </div>
  `;
  async function load(){
    const q = $('#q').value.trim();
    const status = $('#status').value;
    const data = await api.get(`/api/bookings?`+new URLSearchParams({q,status}).toString());
    const rows = data.bookings || [];
    if(!rows.length){
      $('#list').innerHTML = '<div class="muted">No bookings found.</div>';
      return;
    }
    $('#list').innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Trip</th>
            <th>Travelers</th>
            <th>First depart</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(b=>{
            const pay = b.payment_type === 'Miles'
              ? `${b.cost_miles ?? 'N/A'} miles + ${b.fees ?? 'N/A'} fees`
              : (b.cost_cash ?? 'N/A');
            const st = b.any_canceled ? '<span class="badge warn">Has canceled</span>' : '<span class="badge ok">OK</span>';
            return `
              <tr>
                <td><a href="#/booking/${b.id}"><code>#${b.id}</code></a></td>
                <td>
                  <div><strong>${escapeHtml(b.booking_type || 'Booking')}</strong> • ${escapeHtml(b.route || '—')}</div>
                  <div class="muted small">${escapeHtml(b.segment_summary || '')}</div>
                </td>
                <td>${escapeHtml(b.travelers || '')}</td>
                <td>${escapeHtml(b.first_departure || '—')}</td>
                <td>${escapeHtml(String(pay))}</td>
                <td>${st}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
  $('#refresh').addEventListener('click', ()=>load().catch(e=>toast(e.message)));
  $('#q').addEventListener('keydown', (e)=>{ if(e.key==='Enter') load().catch(err=>toast(err.message)); });
  $('#status').addEventListener('change', ()=>load().catch(e=>toast(e.message)));
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
            <label>Ticket end (optional)</label>
            <input id="ticket_end" placeholder="e.g. 016-1234567890"/>
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
        <button id="addSeg" class="btn">+ Add segment</button>
      </div>
      <p class="muted small">Enter flight number + date, then fetch to auto-fill. You can edit anything.</p>
      <div id="segments"></div>
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
  const segWrap = $('#segments');
  $('#addSeg').addEventListener('click', ()=>addSegment());

  function addSegment(prefill={}){
    const idx = segIdx++;
    const el = document.createElement('div');
    el.className = 'card';
    el.style.marginTop = '10px';
    el.dataset.seg = String(idx);
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
          <input data-sdep="${idx}" placeholder="auto" value="${escapeAttr(prefill.sched_departure||'')}"/>
        </div>
        <div>
          <label>Scheduled arrival</label>
          <input data-sarr="${idx}" placeholder="auto" value="${escapeAttr(prefill.sched_arrival||'')}"/>
        </div>
        <div>
          <label>Airline (optional)</label>
          <input data-airline="${idx}" placeholder="auto" value="${escapeAttr(prefill.airline||'')}"/>
        </div>
      </div>
    `;
    segWrap.appendChild(el);

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
        el.querySelector(`[data-sdep="${idx}"]`).value = f.sched_departure || '';
        el.querySelector(`[data-sarr="${idx}"]`).value = f.sched_arrival || '';
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
    const segs = readSegments();
    const hint = segs.length <= 1 ? '' : summarizeLayovers(segs);
    $('#saveHint').textContent = hint ? `Layovers: ${hint}` : '';
  }

  function readSegments(){
    const segCards = Array.from(segWrap.querySelectorAll('[data-seg]'));
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
      };
    }).filter(s=>s.flight_number && s.flight_date);
    // sort by sched_departure if present, else by flight_date
    segs.sort((a,b)=>{
      const da = a.sched_departure ? new Date(a.sched_departure).getTime() : new Date(a.flight_date).getTime();
      const db = b.sched_departure ? new Date(b.sched_departure).getTime() : new Date(b.flight_date).getTime();
      return da-db;
    });
    return segs;
  }

  function summarizeLayovers(segs){
    const parts=[];
    for(let i=0;i<segs.length-1;i++){
      const h = hoursBetween(segs[i].sched_arrival, segs[i+1].sched_departure);
      if(h===null) continue;
      const label = h < 0 ? '—' : (h < 24 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`);
      parts.push(label);
    }
    return parts.join(' • ');
  }

  // start with one segment row
  addSegment();

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
      <h2>Segments</h2>
      <div class="hr"></div>
      <div id="segList"></div>
    </div>
  `;

  // travelers list
  const travList = $('#travList');
  travList.innerHTML = trav.map(t=>{
    const badge = t.status === 'Canceled' ? 'badge danger' : 'badge ok';
    const cancelBtn = t.status === 'Canceled'
      ? `<button class="btn" data-uncancel="${t.id}">Mark active</button>`
      : `<button class="btn btn-danger" data-cancel="${t.id}">Cancel ticket</button>`;
    return `
      <div class="card" style="margin-top:10px">
        <div class="row">
          <strong class="spacer">${escapeHtml(t.name)}</strong>
          <span class="${badge}">${escapeHtml(t.status)}</span>
        </div>
        <div class="grid two" style="margin-top:10px">
          <div>
            <label>PNR</label>
            <input data-pnr="${t.id}" value="${escapeAttr(t.pnr || '')}"/>
          </div>
          <div>
            <label>Category</label>
            <input data-category="${t.id}" value="${escapeAttr(t.category || '')}"/>
          </div>
          <div style="grid-column:1 / -1">
            <label>Reason for travel</label>
            <textarea data-reason="${t.id}">${escapeHtml(t.reason || '')}</textarea>
          </div>
          <div>
            <label>Refund method</label>
            <select data-refund="${t.id}">
              ${['','Card','eCredit','Miles redeposited','Other'].map(x=>`<option ${t.refund_method===x?'selected':''}>${x}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Refund notes</label>
            <input data-refundNotes="${t.id}" value="${escapeAttr(t.refund_notes || '')}"/>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-primary" data-saveTraveler="${t.id}">Save</button>
          ${cancelBtn}
        </div>
      </div>
    `;
  }).join('');

  trav.forEach(t=>{
    travList.querySelector(`[data-saveTraveler="${t.id}"]`)?.addEventListener('click', async ()=>{
      try{
        const payload = {
          pnr: travList.querySelector(`[data-pnr="${t.id}"]`).value.trim(),
          category: travList.querySelector(`[data-category="${t.id}"]`).value.trim(),
          reason: travList.querySelector(`[data-reason="${t.id}"]`).value.trim(),
          refund_method: travList.querySelector(`[data-refund="${t.id}"]`).value.trim(),
          refund_notes: travList.querySelector(`[data-refundNotes="${t.id}"]`).value.trim(),
        };
        await api.put(`/api/travelers/${t.id}`, payload);
        toast('Saved');
        location.reload();
      }catch(e){ toast(e.message); }
    });
    travList.querySelector(`[data-cancel="${t.id}"]`)?.addEventListener('click', async ()=>{
      const refund_method = travList.querySelector(`[data-refund="${t.id}"]`).value.trim() || 'eCredit';
      try{
        await api.put(`/api/travelers/${t.id}/status`, {status:'Canceled', refund_method});
        toast('Canceled');
        location.reload();
      }catch(e){ toast(e.message); }
    });
    travList.querySelector(`[data-uncancel="${t.id}"]`)?.addEventListener('click', async ()=>{
      try{
        await api.put(`/api/travelers/${t.id}/status`, {status:'Active'});
        toast('Active');
        location.reload();
      }catch(e){ toast(e.message); }
    });
  });

  // segments list
  const segList = $('#segList');
  const layover = computeLayovers(segs);
  segList.innerHTML = `
    ${segs.map((s,i)=>`
      <div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="min-width:120px"><strong>${escapeHtml(s.flight_number)}</strong><div class="muted small">${escapeHtml(s.flight_date)}</div></div>
        <div style="min-width:160px">${escapeHtml(s.origin||'—')} → ${escapeHtml(s.destination||'—')}</div>
        <div class="spacer">
          <div class="muted small">Depart</div>
          <div>${escapeHtml(s.sched_departure || '—')}</div>
        </div>
        <div class="spacer">
          <div class="muted small">Arrive</div>
          <div>${escapeHtml(s.sched_arrival || '—')}</div>
        </div>
        <div style="min-width:120px">
          <div class="muted small">Aircraft</div>
          <div>${escapeHtml(s.aircraft_type || '—')}</div>
        </div>
      </div>
      ${i<layover.length ? `<div class="muted small" style="padding:8px 0">Layover: <strong>${layover[i]}</strong></div>`:''}
    `).join('')}
  `;

  $('#deleteBooking').addEventListener('click', async ()=>{
    if(!confirm('Delete booking permanently?')) return;
    try{
      await api.del(`/api/bookings/${encodeURIComponent(id)}`);
      toast('Deleted');
      location.hash = '#/bookings';
    }catch(e){ toast(e.message); }
  });

  function computeLayovers(segs){
    const out=[];
    for(let i=0;i<segs.length-1;i++){
      const h=hoursBetween(segs[i].sched_arrival, segs[i+1].sched_departure);
      if(h===null){ out.push('—'); continue; }
      out.push(h<0?'—':(h<24?`${h.toFixed(1)}h`:`${Math.round(h)}h`));
    }
    return out;
  }
}

/* DASHBOARD */
async function renderDashboard(){
  view.innerHTML = `
    <div class="row">
      <h1 class="spacer">Dashboard</h1>
      <button id="exportBtn" class="btn">Export CSV</button>
    </div>

    <div class="card">
      <div class="grid three">
        <div>
          <label>From</label>
          <input id="from" type="date"/>
        </div>
        <div>
          <label>To</label>
          <input id="to" type="date"/>
        </div>
        <div>
          <label>Person</label>
          <select id="person"><option value="">All</option></select>
        </div>
        <div>
          <label>Category</label>
          <input id="category" placeholder="optional"/>
        </div>
        <div>
          <label>Status</label>
          <select id="status">
            <option value="">All</option>
            <option>Active</option>
            <option>Canceled</option>
          </select>
        </div>
        <div style="display:flex;align-items:end;gap:10px">
          <button id="run" class="btn btn-primary">Run</button>
          <span class="muted small" id="hint"></span>
        </div>
      </div>
    </div>

    <div class="grid three" style="margin-top:14px">
      <div class="card"><div class="muted small">Cash spend</div><div id="k_cash" class="kpi">—</div></div>
      <div class="card"><div class="muted small">Miles used</div><div id="k_miles" class="kpi">—</div></div>
      <div class="card"><div class="muted small">Award fees</div><div id="k_fees" class="kpi">—</div></div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Results</h2>
      <div class="hr"></div>
      <div id="results" class="muted small">Run a report.</div>
    </div>
  `;

  const ppl = (await api.get('/api/people')).people || [];
  const personSel = $('#person');
  personSel.innerHTML = '<option value="">All</option>' + ppl.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  async function run(){
    const params = {
      from: $('#from').value || '',
      to: $('#to').value || '',
      person_id: $('#person').value || '',
      category: $('#category').value.trim() || '',
      status: $('#status').value || ''
    };
    const data = await api.get('/api/report?' + new URLSearchParams(params).toString());
    $('#k_cash').textContent = data.totals.cash_spend ? fmtMoney(data.totals.cash_spend) : '$0';
    $('#k_miles').textContent = (data.totals.miles_used || 0).toLocaleString();
    $('#k_fees').textContent = data.totals.award_fees ? fmtMoney(data.totals.award_fees) : '$0';

    const rows = data.rows || [];
    if(!rows.length){
      $('#results').innerHTML = '<div class="muted">No matching rows.</div>';
      return;
    }
    $('#results').innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Person</th><th>Route</th><th>First depart</th><th>Booking</th><th>Reason</th><th>Payment</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>{
            const pay = r.payment_type==='Miles'
              ? `${r.cost_miles ?? 'N/A'} + fees ${r.fees ?? 'N/A'}`
              : `${r.cost_cash ?? 'N/A'}`;
            return `
              <tr>
                <td>${escapeHtml(r.person)}</td>
                <td>${escapeHtml(r.route||'—')}</td>
                <td>${escapeHtml(r.first_departure||'—')}</td>
                <td><a href="#/booking/${r.booking_id}"><code>#${r.booking_id}</code></a></td>
                <td>${escapeHtml(r.reason||'')}</td>
                <td>${escapeHtml(pay)}</td>
                <td>${r.status==='Canceled' ? '<span class="badge danger">Canceled</span>' : '<span class="badge ok">Active</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  $('#run').addEventListener('click', ()=>run().catch(e=>toast(e.message)));
  $('#exportBtn').addEventListener('click', async ()=>{
    try{
      const params = {
        from: $('#from').value || '',
        to: $('#to').value || '',
        person_id: $('#person').value || '',
        category: $('#category').value.trim() || '',
        status: $('#status').value || ''
      };
      const res = await fetch('/api/report.csv?' + new URLSearchParams(params).toString(), {credentials:'include'});
      if(!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'travel-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    }catch(e){ toast(e.message); }
  });

  // default to last 90 days
  const now = new Date();
  const prior = new Date(now.getTime() - 90*24*3600*1000);
  $('#to').value = now.toISOString().slice(0,10);
  $('#from').value = prior.toISOString().slice(0,10);
  run().catch(e=>toast(e.message));
}

/* ADMIN */
async function renderAdmin(){
  const people = (await api.get('/api/people')).people || [];
  view.innerHTML = `
    <div class="row">
      <h1 class="spacer">Admin</h1>
    </div>

    <div class="grid two">
      <div class="card">
        <h2>People</h2>
        <div class="row" style="margin-top:10px">
          <input id="newName" placeholder="Add new person (full name)"/>
          <button id="addPerson" class="btn btn-primary">Add</button>
        </div>
        <div class="hr"></div>
        <div id="peopleList"></div>
      </div>

      <div class="card">
        <h2>Backup</h2>
        <p class="muted small">Download a JSON backup of the database.</p>
        <button id="backupBtn" class="btn">Download backup</button>
      </div>
    </div>
  `;

  function renderPeople(){
    $('#peopleList').innerHTML = `
      <table class="table">
        <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${people.map(p=>`
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.active ? '<span class="badge ok">Active</span>' : '<span class="badge warn">Inactive</span>'}</td>
              <td>
                <button class="btn" data-toggle="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    people.forEach(p=>{
      document.querySelector(`[data-toggle="${p.id}"]`)?.addEventListener('click', async ()=>{
        try{
          const r = await api.put(`/api/people/${p.id}`, {active: p.active ? 0 : 1});
          p.active = r.active;
          renderPeople();
          toast('Updated');
        }catch(e){ toast(e.message); }
      });
    });
  }
  renderPeople();

  $('#addPerson').addEventListener('click', async ()=>{
    const name = $('#newName').value.trim();
    if(!name) return toast('Enter a name');
    try{
      const r = await api.post('/api/people', {name});
      people.unshift(r.person);
      $('#newName').value = '';
      renderPeople();
      toast('Added');
    }catch(e){ toast(e.message); }
  });

  $('#backupBtn').addEventListener('click', async ()=>{
    try{
      const res = await fetch('/api/backup', {credentials:'include'});
      if(!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'travel-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    }catch(e){ toast(e.message); }
  });
}

/* helpers */
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g,' '); }
