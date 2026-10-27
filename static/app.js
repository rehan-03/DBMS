'use strict';
const $ = (id) => document.getElementById(id);
const state = {accounts: [], rows: [], cursor: null, selected: null, lastPayload: null, unresolved: false, busy: false, polling: false, reversalKey: null, lastUpdated: null};
const escapeHTML = (value) => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency = new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', minimumFractionDigits:2});
const money = (value) => value == null ? '—' : currency.format(value / 100);
const clock = (value) => new Date(value).toLocaleTimeString('en-IN', {timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', hour12:false}) + ' IST';
const shortID = (value) => value ? '…' + value.slice(-8) : '—';
const uuid = () => crypto.randomUUID();
const outcomes = {COMMITTED:['Committed','good'], RETRY_BLOCKED:['Retry blocked',''], ROLLED_BACK:['Rolled back','bad'], REJECTED:['Rejected','bad'], UNKNOWN:['Outcome unknown','pending'], PENDING:['Processing','pending']};
function paise(value, allowZero=false) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter an INR amount with at most two decimal places.');
  const [whole, fraction=''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1) || amount > (allowZero ? 1000000000 : 100000000)) throw new Error('Amount is outside the permitted range.');
  return amount;
}
async function api(path, options={}) {
  const response = await fetch(path, {...options, headers:{'Content-Type':'application/json', ...options.headers}, signal:AbortSignal.timeout(path.includes('reconciliation/run') ? 35000 : 15000)});
  const body = await response.json();
  if (!response.ok) {const error = new Error(body.error?.message || 'The request could not be completed.'); error.body = body; error.status = response.status; throw error;}
  return {body, response};
}
const post = (path, data) => api(path, {method:'POST', body:JSON.stringify(data)});
function errorBlock(id, error) {$(id).hidden = !error; $(id).textContent = error ? `${error.message} ${state.lastUpdated ? 'Last update ' + clock(state.lastUpdated) + '.' : ''}` : '';}
function message(id, text, kind='') {const el = $(id); el.hidden = false; el.className = `result-message ${kind}`; el.textContent = text;}
function applyLock() {
  const lock = state.busy || state.unresolved || ($('reuse-key').checked && !!state.lastPayload);
  for (const id of ['from-account','to-account','transfer-amount']) $(id).disabled = lock;
  $('reuse-key').disabled = state.busy || state.unresolved || !state.lastPayload;
  $('submit-transfer').disabled = state.busy || state.unresolved || state.accounts.length < 2;
  $('submit-transfer').textContent = state.busy ? 'Submitting…' : $('reuse-key').checked && state.lastPayload ? 'Repeat same request ↗' : 'Make transfer ↗';
  $('new-transfer').hidden = !state.lastPayload || state.unresolved;
  $('new-transfer').disabled = state.busy;
  $('check-result').hidden = !state.unresolved;
}
function newTransfer() {
  if (state.unresolved) return;
  state.lastPayload = null; $('reuse-key').checked = false; $('transfer-key').value = uuid(); $('transfer-result').hidden = true; applyLock();
}
async function loadAccounts() {
  let all = [], cursor = null;
  do {const {body} = await api('/api/accounts?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')); all.push(...body.items); cursor=body.next_cursor;} while(cursor);
  state.accounts = all;
  for (const id of ['from-account','to-account']) {
    const selected = $(id).value;
    $(id).innerHTML = '<option value="">Select account</option>' + all.map(a => `<option value="${escapeHTML(a.handle)}" ${a.status !== 'ACTIVE' ? 'disabled' : ''}>${escapeHTML(a.handle)} · ${money(a.balance)}${a.status !== 'ACTIVE' ? ' · frozen' : ''}</option>`).join('');
    if (all.some(a => a.handle===selected)) $(id).value=selected;
  }
  const render = (a, full=false) => `<div class="account-item"><span class="avatar" aria-hidden="true">${escapeHTML(a.display_name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</span><div class="identity"><div class="account-name" title="${escapeHTML(a.handle)}">${escapeHTML(full ? a.display_name + ' · ' + a.handle : a.handle)}</div><strong class="num">${money(a.balance)}</strong>${a.status !== 'ACTIVE' ? ' <small>Frozen</small>' : ''}</div></div>`;
  const visible = [...all].sort((a,b)=>b.balance-a.balance).slice(0,3);
  $('account-strip').innerHTML = visible.length ? visible.map(a=>render(a)).join('') : '<p class="empty">No accounts yet. Create two to make a transfer.</p>';
  $('all-accounts').innerHTML = all.length ? all.map(a=>render(a,true)).join('') : '<p class="empty">No user accounts yet.</p>';
  errorBlock('accounts-error',null); applyLock();
}
async function loadStats() {
  const {body:s} = await api('/api/stats');
  $('metric-transfers').textContent=s.transfers_today.toLocaleString('en-IN');
  $('metric-success').textContent=s.success_rate_percent == null ? '—' : s.success_rate_percent.toFixed(2)+'%';
  $('metric-duplicates').textContent=s.duplicates_blocked.toLocaleString('en-IN');
  $('metric-rollbacks').textContent=s.rolled_back_count.toLocaleString('en-IN');
  $('workspace-notice').hidden=s.telemetry_complete;
  $('workspace-notice').textContent=`${s.unresolved_attempts} request attempt(s) await resolution. Counts may be incomplete; check the original key. Financial balances remain protected.`;
}
function renderRun(run) {
  if (!run) return;
  const balanced=run.status==='BALANCED', failed=run.status==='ERROR';
  $('book-status').textContent=failed ? 'Reconciliation could not finish' : balanced ? 'Books balanced' : 'Discrepancies found';
  $('book-caption').textContent=failed ? 'Previous figures are historical. Run a new check.' : balanced ? 'Every debit has a credit. All integrity checks passed.' : `${run.finding_count} finding(s) need investigation. Entries have not been changed.`;
  $('book-badge').textContent=failed ? 'Check failed' : balanced ? 'All checks passed' : 'Needs attention';
  $('book-badge').className='status '+(failed || !balanced ? 'bad' : 'good');
  if (!failed) for (const [id,key] of [['total-debits','total_debits'],['total-credits','total_credits'],['total-difference','difference']]) $(id).textContent=money(run[key]);
  $('reconciliation-time').textContent=`Last run ${clock(run.completed_at)} · ${run.duration_ms.toLocaleString('en-IN')} ms`;
  $('report-link').hidden=!run.report_url; if(run.report_url) $('report-link').href=run.report_url;
  $('finding-details').hidden=!run.finding_count;
  $('finding-summary').textContent=`Findings (${Math.min(run.finding_count || 0,100)} of ${run.finding_count || 0})`;
  $('findings').innerHTML=(run.findings_preview||[]).map(f=>`<li><strong>${escapeHTML(f.code)}</strong> — ${escapeHTML(f.message)} <span class="mono">${escapeHTML(f.account_id || f.transaction_id || f.entry_id || '')}</span></li>`).join('');
}
async function loadReconciliation() {const {body} = await api('/api/reconciliation/latest'); renderRun(body.run); errorBlock('reconciliation-error',null);}
function renderRows() {
  $('activity-body').innerHTML=state.rows.length ? state.rows.map(row=>{
    const [label,kind]=outcomes[row.outcome || 'COMMITTED']; const tid=row.transaction_id || row.id;
    return `<tr class="${state.selected===tid?'selected':''}"><td>${tid?`<button class="table-id" data-transaction="${escapeHTML(tid)}" title="${escapeHTML(tid)}">${shortID(tid)}</button>`:`<button class="table-id" data-request="${escapeHTML(row.request_id)}" title="${escapeHTML(row.request_id)}">req ${shortID(row.request_id)}</button>`}<span class="table-sub">${clock(row.received_at || row.created_at)}${row.type==='OPENING'?' · opening':row.type==='REVERSAL' || row.operation==='REVERSAL'?' · reversal':''}</span></td><td><span class="party">${escapeHTML(row.from)}</span><span class="party">→ ${escapeHTML(row.to)}</span></td><td class="num">${money(row.amount)}</td><td><span class="table-key" title="${escapeHTML(row.idempotency_key)}">${escapeHTML(row.idempotency_key)}</span></td><td><span class="status ${kind}">${label}</span></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No matching transfers. Your next transfer will appear here.</td></tr>';
  $('activity-count').textContent=`${state.rows.length} ${$('history-mode').value==='transactions'?'committed movements':'request attempts'} shown · amounts in INR`;
  $('load-more').hidden=!state.cursor;
}
async function loadHistory(more=false) {
  const committed=$('history-mode').value==='transactions'; const query=new URLSearchParams({limit:'6'});
  if(committed) query.set('type','ALL');
  if($('key-filter').value.trim()) query.set('idempotency_key',$('key-filter').value.trim());
  if(!committed && $('outcome-filter').value) query.set('outcome',$('outcome-filter').value);
  if(more && state.cursor) query.set('cursor',state.cursor);
  const {body} = await api((committed?'/api/transactions?':'/api/transfer-attempts?')+query);
  state.rows=more?[...state.rows,...body.items]:body.items; state.cursor=body.next_cursor;
  renderRows(); errorBlock('history-error',null);
}
async function selectTransaction(id) {
  state.selected=id; renderRows(); $('ledger-content').innerHTML='<p class="empty">Loading the two postings…</p>';
  try {
    const {body:data}=await api(`/api/transactions/${id}/entries`);
    if(state.selected!==id)return;
    $('entry-count').textContent=`${data.entries.length} entries`;
    $('ledger-content').innerHTML=`<div class="ledger-meta mono" title="${escapeHTML(id)}">${escapeHTML(id)}</div>${data.integrity_warning?'<p class="block-error">Integrity warning: this payment does not have a valid entry pair.</p>':''}`+data.entries.map(e=>`<div class="posting"><span class="direction">${e.direction==='DEBIT'?'Debit · outgoing':'Credit · incoming'}</span><span class="posting-handle">${escapeHTML(e.handle)}</span><span class="posting-amount">${e.direction==='DEBIT'?'−':'+'}${money(e.amount)}</span><div class="balance-after"><span>Balance after ${money(e.balance_after)}</span><span>v${e.account_version_after}</span></div></div>`).join('')+`<div class="ledger-action"><span>${data.type==='TRANSFER'?'Immutable postings':'Movement: '+escapeHTML(data.type.toLowerCase())}</span>${data.type==='TRANSFER'?'<button class="text-button" id="reverse-selected">Reverse transfer ↗</button>':''}</div>`;
  } catch(error) {if(state.selected===id)$('ledger-content').innerHTML=`<p class="block-error">${escapeHTML(error.message)}</p>`;}
}
async function refresh() {
  if(state.polling || document.hidden)return; state.polling=true;
  const jobs=[loadAccounts,loadStats,()=>state.rows.length>6?Promise.resolve():loadHistory(),loadReconciliation];
  const results=await Promise.allSettled(jobs.map(job=>job()));
  const errors=results.filter(r=>r.status==='rejected');
  if(results[0].status==='rejected')errorBlock('accounts-error',results[0].reason);
  if(results[2].status==='rejected')errorBlock('history-error',results[2].reason);
  if(results[3].status==='rejected')errorBlock('reconciliation-error',results[3].reason);
  $('connection').className='connection '+(errors.length?'offline':'online'); $('connection').innerHTML=`<i></i>${errors.length?'Connection issue':'Connected'}`;
  if(!errors.length){state.lastUpdated=new Date();$('freshness').textContent='Updated '+clock(state.lastUpdated);}else $('freshness').textContent=state.lastUpdated?'Last update '+clock(state.lastUpdated):'Database setup required';
  if(results[1].status==='rejected'){$('workspace-notice').hidden=false;$('workspace-notice').textContent='Could not load ledger metrics. Start MongoDB and run database bootstrap; then refresh. Existing form values are retained.';}
  state.polling=false;
}
function resolvedTransfer(body,replayed=false,failed=false) {
  state.unresolved=false;
  if(failed)message('transfer-result',`${body.error?.code || 'Request rejected'}: ${body.error?.message || 'The request was rejected.'}${replayed?' This is the saved original result.':''}`,'bad');
  else {message('transfer-result',`${replayed?'Retry blocked — original transfer returned.':'Transfer committed.'} ${money(body.amount)} · ${shortID(body.transaction_id)}. ${replayed?'No additional money moved.':'Both entries are recorded.'}`,'good'); selectTransaction(body.transaction_id);}
  applyLock(); refresh();
}
$('transfer-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(state.busy || state.unresolved)return;
  let payload;
  try {payload=$('reuse-key').checked && state.lastPayload ? state.lastPayload : {from:$('from-account').value,to:$('to-account').value,amount:paise($('transfer-amount').value),idempotency_key:$('transfer-key').value};
    if(payload.from===payload.to)throw new Error('Choose two different accounts.');
    if(state.lastPayload && !$('reuse-key').checked){payload.idempotency_key=uuid();$('transfer-key').value=payload.idempotency_key;}
  }catch(error){message('transfer-result',error.message,'bad');return;}
  state.lastPayload={...payload}; state.busy=true; applyLock();
  try {const {body,response}=await post('/api/transfers',payload); if(response.status===202){state.unresolved=true;message('transfer-result','Result pending. Keep this key; check the result before making another payment.','pending');}else resolvedTransfer(body,response.headers.get('Idempotency-Replayed')==='true');}
  catch(error){if(error.status && error.status<500)resolvedTransfer(error.body,false,true);else if(error.body?.error?.code==='DEMO_FAILURE')resolvedTransfer(error.body,false,true);else{state.unresolved=true;message('transfer-result','Result unknown. Your key and original request are retained. Check the result; do not submit with a new key.','pending');}}
  finally{state.busy=false;applyLock();}
});
$('check-result').addEventListener('click',async()=>{
  if(!state.lastPayload)return; $('check-result').disabled=true;
  try {const {body:status}=await api('/api/transfers/requests/'+encodeURIComponent(state.lastPayload.idempotency_key));
    if(status.response)resolvedTransfer(status.response.body,true,status.state==='FAILED');
    else {const {body,response}=await post('/api/transfers',state.lastPayload);if(response.status!==202)resolvedTransfer(body,response.headers.get('Idempotency-Replayed')==='true');else message('transfer-result','Still processing. Keep the same key and check again shortly.','pending');}
  }catch(error){if(error.status===404){state.unresolved=false;message('transfer-result','No reservation exists. The same original request can be submitted again safely.','pending');applyLock();}else if(error.body && error.status<500)resolvedTransfer(error.body,true,true);else message('transfer-result',error.message+' Keep the original key.','pending');}
  finally{$('check-result').disabled=false;}
});
$('reuse-key').addEventListener('change',()=>{if($('reuse-key').checked && state.lastPayload){$('from-account').value=state.lastPayload.from;$('to-account').value=state.lastPayload.to;$('transfer-amount').value=(state.lastPayload.amount/100).toFixed(2);$('transfer-key').value=state.lastPayload.idempotency_key;}applyLock();});
$('new-transfer').addEventListener('click',newTransfer);
$('copy-key').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('transfer-key').value);$('copy-key').textContent='Copied';setTimeout(()=>$('copy-key').textContent='Copy',1500);}catch{$('transfer-key').select();}});
$('refresh').addEventListener('click',()=>{state.rows=[];refresh();});
$('open-account').addEventListener('click',()=>$('account-dialog').showModal());
$('show-accounts').addEventListener('click',()=>$('accounts-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
$('account-form').addEventListener('submit',async event=>{event.preventDefault();const submit=event.submitter;submit.disabled=true;try{const {body}=await post('/api/accounts',{display_name:$('account-name').value,handle:$('account-handle').value,opening_balance:paise($('opening-amount').value,true),status:$('account-status').value});$('account-dialog').close();$('account-form').reset();$('opening-amount').value='0.00';await refresh();if(body.opening_transaction_id)selectTransaction(body.opening_transaction_id);}catch(error){message('account-result',error.message,'bad');}finally{submit.disabled=false;}});
$('run-reconciliation').addEventListener('click',async()=>{const button=$('run-reconciliation');button.disabled=true;button.textContent='Checking…';try{const {body}=await post('/api/reconciliation/run',{});renderRun(body.run);errorBlock('reconciliation-error',null);}catch(error){if(error.body?.run)renderRun(error.body.run);errorBlock('reconciliation-error',error);}finally{button.disabled=false;button.textContent='Run reconciliation';}});
$('activity-body').addEventListener('click',event=>{const transaction=event.target.closest('[data-transaction]');if(transaction)selectTransaction(transaction.dataset.transaction);const requestRow=event.target.closest('[data-request]');if(requestRow){const row=state.rows.find(r=>r.request_id===requestRow.dataset.request);$('entry-count').textContent='No committed entries';$('ledger-content').innerHTML=`<div class="ledger-empty"><p>${escapeHTML(outcomes[row.outcome][0])}</p><span>${escapeHTML(row.error_code || 'The request has not resolved yet. Check the original key.')}</span><p class="mono">${escapeHTML(row.request_id)}</p></div>`;}});
$('load-more').addEventListener('click',()=>loadHistory(true).catch(error=>errorBlock('history-error',error)));
for(const id of ['history-mode','outcome-filter'])$(id).addEventListener('change',()=>{$('outcome-filter').disabled=$('history-mode').value==='transactions';loadHistory().catch(error=>errorBlock('history-error',error));});
let filterTimer;$('key-filter').addEventListener('input',()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>loadHistory().catch(error=>errorBlock('history-error',error)),400);});
$('ledger-content').addEventListener('click',event=>{if(event.target.id==='reverse-selected'){const row=state.rows.find(r=>(r.transaction_id || r.id)===state.selected);state.reversalKey=uuid();$('reversal-description').textContent=`Post an equal-and-opposite transfer for ${state.selected}${row?' · '+money(row.amount):''}?`;$('reversal-result').hidden=true;$('reversal-dialog').showModal();}});
$('reversal-form').addEventListener('submit',async event=>{event.preventDefault();const button=$('confirm-reversal');button.disabled=true;try{const {body,response}=await post(`/api/transactions/${state.selected}/reverse`,{idempotency_key:state.reversalKey});if(response.status===202)message('reversal-result','Reversal pending. Click again using this same key to check its result.','pending');else{$('reversal-dialog').close();await refresh();selectTransaction(body.transaction_id);}}catch(error){message('reversal-result',error.status?error.message:'Result unknown. Keep this dialog open and retry with the same key.','bad');}finally{button.disabled=false;}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
newTransfer();refresh();setInterval(refresh,5000);
