/* Private business screens. Supabase access and confirmed writes live in admin.js. */
const jobStatuses=['Enquiry','Quote sent','Booked','In progress','Completed','Cancelled'];
const expenseCategories=['Tools','Materials','Fuel/travel','Advertising','Insurance','Other'];

function londonFields(iso){
  if(!iso)return {date:'',time:''};
  const d=new Date(iso);if(!Number.isFinite(d.getTime()))return {date:'',time:''};
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
function londonTimestamp(date,time){
  if(!date&&!time)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Choose both a date and a time, or leave both empty.');
  const utc=Date.parse(`${date}T${time}:00Z`);
  if(!Number.isFinite(utc)||new Date(utc).toISOString().slice(0,16)!==`${date}T${time}`)throw new Error('Choose a valid date and time.');
  const matches=[utc,utc-3600000].filter(t=>{const p=londonFields(t);return p.date===date&&p.time===time;});
  if(!matches.length)throw new Error('That time does not exist in Scotland because the clocks go forward. Choose another time.');
  if(matches.length>1)throw new Error('That time occurs twice when the clocks go back. Choose a time before 01:00 or from 02:00 onwards.');
  return new Date(matches[0]).toISOString();
}
function businessDate(iso){
  if(!iso)return 'Date and time not set';
  const d=new Date(iso);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(d):'Date unavailable';
}
function todayLondon(){return londonFields(new Date()).date;}
function plainDate(date){
  if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return 'Date not recorded';
  const d=new Date(`${date}T12:00:00Z`);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium'}).format(d):'Date unavailable';
}
function moneyPennies(raw,label='Amount',required=false){
  const s=String(raw??'').trim();if(!s){if(required)throw new Error(`Enter ${label.toLowerCase()}.`);return null;}
  if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error(`${label} must be £0 or more, with no more than two decimal places.`);
  const [whole,fraction='']=s.split('.'),p=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(p)||p>100000000)throw new Error(`${label} must be no more than £1,000,000.`);
  return p;
}
function storedPennies(raw){try{return moneyPennies(raw);}catch{return null;}}
function statusIs(row,status){return String(row.status??'').trim().toLowerCase()===status.toLowerCase();}
function isActiveJob(row){return !statusIs(row,'Completed')&&!statusIs(row,'Cancelled');}
function jobUpcoming(rows){const now=Date.now();return rows.filter(x=>isActiveJob(x)&&x.scheduled_at&&new Date(x.scheduled_at).getTime()>=now).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at));}
function businessTotals(jobs,expenses){
  let revenue=0,spending=0,missingFinal=0,invalidExpense=0;
  for(const job of jobs.filter(x=>statusIs(x,'Completed'))){const p=storedPennies(job.final_price);if(p===null)missingFinal++;else revenue+=p;}
  for(const expense of expenses){const p=storedPennies(expense.amount);if(p===null)invalidExpense++;else spending+=p;}
  return {revenue,spending,profit:revenue-spending,missingFinal,invalidExpense};
}
function totalsNote(t){return `<p class="muted">Revenue is the final price of completed jobs, whether or not payment has been received. Estimated profit is that revenue less recorded expenses, before tax and any costs not entered.</p>${t.missingFinal?`<div class="notice">${t.missingFinal} completed job${t.missingFinal===1?' has':'s have'} no valid final price and ${t.missingFinal===1?'is':'are'} excluded from revenue. Open the job to add its final price. £0 is valid for a free job.</div>`:''}${t.invalidExpense?`<div class="error" role="alert">${t.invalidExpense} expense record${t.invalidExpense===1?' has':'s have'} no valid amount. Totals exclude these records; edit them before relying on the figures.</div>`:''}`;}
function recordById(rows,id,label){const row=rows.find(x=>String(x.id)===String(id));if(!row)throw new Error(`${label} could not be found. It may have been removed. Return to the list and refresh.`);return row;}
function customerName(id){const x=customerRows.find(c=>String(c.id)===String(id));return x?.name||(id?'Customer unavailable':'No customer selected');}
function jobListMarkup(rows,empty='No jobs to show.'){
  return rows.length?rows.map(x=>`<div class="row"><b>${esc(x.title||'Untitled job')}</b><p><span class="badge">${esc(x.status||'Status not set')}</span></p><p class="muted">${esc(customerName(x.customer_id))}<br>${esc(businessDate(x.scheduled_at))}${x.location?`<br>${esc(x.location)}`:''}</p><div class="actions"><span>${x.price!=null?`${pounds(x.price)} quoted`:'Quote not set'}${x.final_price!=null?` · ${pounds(x.final_price)} final`:''}</span><button class="btn secondary" data-id="${esc(x.id)}" onclick="newJob(this.dataset.id)">Open job</button></div></div>`).join(''):`<p class="empty">${esc(empty)}</p>`;
}
function moneyStats(t){return `<div class="grid"><div class="stat">Completed-job revenue<b>${pounds(t.revenue/100)}</b></div><div class="stat">Total expenses<b>${pounds(t.spending/100)}</b></div><div class="stat">Estimated profit<b>${pounds(t.profit/100)}</b></div></div>`;}

async function home(){
  const token=loading('Overview','home');
  try{
    const [j,c,e]=await Promise.all([loadRows('jobs'),loadRows('customers'),loadRows('expenses')]);if(!current(token))return;
    jobRows=j;customerRows=c;expenseRows=e;
    const t=businessTotals(j,e),upcoming=jobUpcoming(j),awaiting=j.filter(x=>statusIs(x,'Enquiry')||statusIs(x,'Quote sent'));
    document.getElementById('main').innerHTML=`<h1>Your business, at a glance</h1><p class="muted">Job times are shown in Scotland time (Europe/London).</p><div class="grid"><div class="stat">Upcoming jobs<b>${upcoming.length}</b></div><div class="stat">Enquiries awaiting action<b>${awaiting.length}</b></div><div class="stat">Booked jobs<b>${j.filter(x=>statusIs(x,'Booked')).length}</b></div><div class="stat">Completed jobs<b>${j.filter(x=>statusIs(x,'Completed')).length}</b></div><div class="stat">Customers<b>${c.length}</b></div></div><div class="card"><h2>Quick actions</h2><div class="actions"><button class="btn primary" onclick="leads()">Leads & follow-ups</button><button class="btn secondary" onclick="newJob()">New job</button><button class="btn secondary" onclick="newCustomer()">New customer</button><button class="btn secondary" onclick="newExpense()">New expense</button><button class="btn secondary" onclick="website()">Edit website</button><button class="btn secondary" onclick="go('tools')">Business tools</button></div></div><div class="split"><div class="card"><h2>Next jobs</h2>${jobListMarkup(upcoming.slice(0,5),'No upcoming jobs scheduled. Add a job or agree a date for an enquiry.')}<button class="btn secondary" onclick="go('jobs')">All jobs</button></div><div class="card"><h2>Needs a reply or decision</h2>${jobListMarkup(awaiting.slice(0,5),'No enquiries or quotes awaiting action.')}</div></div><h2>Money overview</h2>${moneyStats(t)}${totalsNote(t)}<div class="card"><h2>Keep a private backup</h2><p class="muted">Export your accessible records. Keep this file private: it includes customer details. No connection keys or sign-in tokens are included.</p><button class="btn secondary" onclick="exportData(this)">Export business records</button><div id="exportError" role="alert"></div><p class="muted">This is a data export. Restoring it needs a separate import process.</p></div>`;
  }catch(e){loadError('Overview',e,'home',token);}
}

async function jobs(){
  const token=loading('Jobs','jobs');try{const [j,c]=await Promise.all([loadRows('jobs'),loadRows('customers')]);if(!current(token))return;jobRows=j;customerRows=c;renderJobs();}catch(e){loadError('Jobs',e,'jobs',token);}
}
function renderJobs(filter='all'){
  requireAuth();const rows=jobRows.filter(x=>filter==='all'||(filter==='active'?isActiveJob(x):statusIs(x,filter))),upcoming=jobUpcoming(rows),ids=new Set(upcoming.map(x=>String(x.id))),other=rows.filter(x=>!ids.has(String(x.id))).sort((a,b)=>(Date.parse(b.scheduled_at)||0)-(Date.parse(a.scheduled_at)||0));
  document.getElementById('main').innerHTML=`<h1>Jobs</h1><p class="muted">An enquiry is booked only after you and the customer agree. All times use Europe/London.</p><div class="actions"><button class="btn primary" onclick="newJob()">New job</button></div><div class="field"><label for="job_filter">Show jobs</label><select id="job_filter" onchange="renderJobs(this.value)">${['all','active',...jobStatuses].map(s=>`<option value="${esc(s)}" ${s===filter?'selected':''}>${s==='all'?'All jobs':s==='active'?'Active jobs':esc(s)}</option>`).join('')}</select></div>${jobRows.length?`<div class="card"><h2>Upcoming jobs</h2>${jobListMarkup(upcoming,'No upcoming jobs in this view.')}</div><div class="card"><h2>Other jobs</h2>${jobListMarkup(other,'No other jobs in this view.')}</div>`:'<div class="card"><h2>Your first job starts here</h2><p class="empty">Add an enquiry when someone gets in touch. Add a customer first if you want to link their contact details.</p><button class="btn secondary" onclick="newCustomer()">New customer</button></div>'}`;
}
async function newJob(id=null,selectedCustomer=null){
  const token=loading(id==null?'New job':'Edit job','jobs');
  try{
    const [j,c]=await Promise.all([id==null?Promise.resolve(jobRows):loadRows('jobs'),loadRows('customers')]);if(!current(token))return;jobRows=j;customerRows=c;
    const x=id==null?{}:recordById(j,id,'Job'),when=londonFields(x.scheduled_at),customerId=x.customer_id??selectedCustomer??'',legacy=x.status&&!jobStatuses.includes(x.status),selectedStatus=x.status||'Enquiry',missingCustomer=customerId&&!c.some(v=>String(v.id)===String(customerId));
    document.getElementById('main').innerHTML=`<h1>${id==null?'New job':'Edit job'}</h1><div class="card"><form data-id="${esc(id??'')}" data-request-id="${esc(newRequestId())}" data-original-status="${esc(x.status??'')}" onsubmit="event.preventDefault();saveJob(this)"><div class="field"><label for="job_customer">Customer (optional)</label><select id="job_customer"><option value="">No customer selected</option>${missingCustomer?`<option value="${esc(customerId)}" selected>Existing customer — unavailable</option>`:''}${c.slice().sort((a,b)=>String(a.name??'').localeCompare(String(b.name??''))).map(v=>`<option value="${esc(v.id)}" ${String(v.id)===String(customerId)?'selected':''}>${esc(v.name||'Unnamed customer')}${v.postcode?` · ${esc(v.postcode)}`:''}</option>`).join('')}</select></div>${!c.length?'<p class="muted">You can save this job now and link a customer later from the Customers tab.</p>':''}${field('job_title','Job title',x.title??'','text','required maxlength="300" placeholder="e.g. Mount living-room TV"')}${textField('job_description','Description / notes',x.description??'','maxlength="10000"')}${textField('job_location','Job address / location',x.location??'','maxlength="2000" autocomplete="street-address"')}${c.length?'<button class="btn secondary" type="button" onclick="useCustomerAddress(this.form)">Use selected customer’s address</button>':''}<div class="field"><label for="job_status">Status</label><select id="job_status" required>${legacy?`<option value="${esc(x.status)}" selected>${esc(x.status)} (existing status)</option>`:''}${jobStatuses.map(s=>`<option ${s===selectedStatus?'selected':''}>${esc(s)}</option>`).join('')}</select></div>${legacy?'<div class="notice">This job has an older status. Choose a current status before saving changes. The existing record stays unchanged until you save.</div>':''}<div class="split"><div>${field('job_date','Scheduled date',when.date,'date','min="2000-01-01" max="2100-12-31"')}</div><div>${field('job_time','Scheduled time',when.time,'time')}</div></div><p class="muted">Use Scotland time (Europe/London). Leave both date and time blank if not agreed.</p>${field('job_price','Quoted price (£, optional)',x.price??'','number','min="0" max="1000000" step="0.01" inputmode="decimal"')}${field('job_final_price','Final price (£, optional)',x.final_price??'','number','min="0" max="1000000" step="0.01" inputmode="decimal"')}<p class="muted">Only the final price of completed jobs contributes to revenue. Leave it blank if unknown; enter £0 for a free job. This does not record a payment.</p><div class="form-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit">Save job</button><button class="btn secondary" type="button" onclick="go('jobs')">Back to jobs</button></div>${id!=null?`<div class="actions" style="margin-top:20px">${!statusIs(x,'Cancelled')?'<button class="btn secondary" type="button" onclick="cancelJob(this.form)">Cancel job</button>':''}<button class="btn secondary" type="button" onclick="deleteJob(this.form)">Delete job</button></div><p class="muted">Cancelling keeps the history. Deleting permanently removes the job.</p>`:''}</form></div>`;
    window.scrollTo(0,0);
  }catch(e){loadError('Job',e,'jobs',token);}
}
function useCustomerAddress(form){
  const row=customerRows.find(c=>String(c.id)===value('job_customer'));if(!row){say('Choose a customer first.');return;}
  const address=[row.address,row.postcode].filter(Boolean).join('\n');if(!address){say('This customer has no address saved.');return;}
  if(value('job_location')&&!confirm('Replace the job address with this customer’s saved address?'))return;
  form.querySelector('#job_location').value=address;
}
async function saveJob(form){
  await submit(form,async()=>{
    const title=value('job_title'),status=value('job_status'),customer=value('job_customer');if(!title)throw new Error('Enter a job title.');
    if(!jobStatuses.includes(status))throw new Error('Choose one of the current job statuses before saving this older record.');
    const price=moneyPennies(value('job_price'),'Quoted price'),final=moneyPennies(value('job_final_price'),'Final price');
    const data={title,description:value('job_description'),location:value('job_location'),customer_id:customer||null,status,scheduled_at:londonTimestamp(value('job_date'),value('job_time')),price:price===null?null:price/100,final_price:final===null?null:final/100};
    await saveEntity('jobs',form.dataset.id||null,data,form.dataset.requestId);
    if(form.isConnected){say('Job saved.');await jobs();}
  });
}
async function cancelJob(form){
  if(form.dataset.busy==='true')return;
  if(!confirm('Cancel this job? The job and customer history will be kept.'))return;
  await submit(form,async()=>{await saveEntity('jobs',form.dataset.id,{status:'Cancelled'});if(form.isConnected){say('Job cancelled.');await jobs();}},true,false);
}
async function deleteJob(form){
  if(form.dataset.busy==='true')return;
  if(!confirm('Permanently delete this job? Its job history and any revenue recorded against it will be removed. This cannot be undone.'))return;
  await submit(form,async()=>{await deleteEntity('jobs',form.dataset.id);if(form.isConnected){say('Job deleted.');await jobs();}},true,false);
}

function customerPhone(raw){
  let number=String(raw??'').trim();if(!number)return '';
  if(!/^[+\d\s().-]+$/.test(number))return '';
  number=number.replace(/[\s().-]/g,'');if(number.startsWith('00'))number='+'+number.slice(2);if(number.startsWith('0'))number='+44'+number.slice(1);else if(number.startsWith('44'))number='+'+number;
  return /^\+[1-9]\d{7,14}$/.test(number)?number:'';
}
function validCustomerEmail(raw){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(raw??''));}
function customerContactLinks(row){
  const phone=customerPhone(row.phone),email=validCustomerEmail(row.email)?row.email:'';
  return `<div class="actions">${phone?`<a class="btn secondary" href="tel:${esc(phone)}">Call</a><a class="btn secondary" href="https://wa.me/${phone.slice(1)}" target="_blank" rel="noopener">WhatsApp</a>`:''}${email?`<a class="btn secondary" href="mailto:${esc(encodeURIComponent(email).replace(/%40/g,'@'))}">Email</a>`:''}</div>`;
}
async function customers(){
  const token=loading('Customers','customers');try{const c=await loadRows('customers');if(!current(token))return;customerRows=c;
    document.getElementById('main').innerHTML=`<h1>Customers</h1><p class="muted">Private contact details and job history.</p><button class="btn primary" onclick="newCustomer()">New customer</button>${c.length?`${field('customer_search','Find a customer','','search','autocomplete="off" oninput="filterCustomers(this.value)"')}<div class="card" id="customer_list">${c.slice().sort((a,b)=>String(a.name??'').localeCompare(String(b.name??''))).map(x=>`<div class="row" data-search="${esc([x.name,x.phone,x.email,x.address,x.postcode].filter(Boolean).join(' ').toLowerCase())}"><b>${esc(x.name||'Unnamed customer')}</b><p class="muted">${esc([x.phone,x.email,x.postcode].filter(Boolean).join(' · ')||'No contact details yet')}</p><div class="actions"><button class="btn secondary" data-id="${esc(x.id)}" onclick="customerDetail(this.dataset.id)">View customer</button><button class="btn secondary" data-id="${esc(x.id)}" onclick="newCustomer(this.dataset.id)">Edit</button></div></div>`).join('')}<p class="empty" id="customer_no_match" hidden>No customers match that search.</p></div>`:'<div class="card"><h2>Your customers</h2><p class="empty">No customers yet. Add a name and whichever contact details the customer has provided.</p></div>'}`;
  }catch(e){loadError('Customers',e,'customers',token);}
}
function filterCustomers(term){const needle=term.trim().toLowerCase(),rows=[...document.querySelectorAll('#customer_list .row')];let visible=0;rows.forEach(row=>{row.hidden=!row.dataset.search.includes(needle);if(!row.hidden)visible++;});document.getElementById('customer_no_match').hidden=visible>0;}
async function newCustomer(id=null){
  const token=loading(id==null?'New customer':'Edit customer','customers');
  try{const rows=id==null?customerRows:await loadRows('customers');if(!current(token))return;customerRows=rows;const x=id==null?{}:recordById(rows,id,'Customer');
    document.getElementById('main').innerHTML=`<h1>${id==null?'New customer':'Edit customer'}</h1><div class="card"><form data-id="${esc(id??'')}" data-request-id="${esc(newRequestId())}" onsubmit="event.preventDefault();saveCustomer(this)">${field('customer_name','Name',x.name??'','text','required maxlength="200" autocomplete="name"')}${field('customer_phone','Phone (optional)',x.phone??'','tel','maxlength="40" autocomplete="tel" placeholder="e.g. 07… or +44…"')}${field('customer_email','Email (optional)',x.email??'','email','maxlength="320" autocomplete="email"')}${textField('customer_address','Address (optional)',x.address??'','maxlength="2000" autocomplete="street-address"')}${field('customer_postcode','Postcode (optional)',x.postcode??'','text','maxlength="16" autocomplete="postal-code" autocapitalize="characters"')}${textField('customer_notes','Notes (optional)',x.notes??'','maxlength="10000"')}<p class="muted">Keep notes relevant to the work and store only details you need.</p><div class="form-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit">Save customer</button><button class="btn secondary" type="button" onclick="go('customers')">Back to customers</button></div></form></div>`;window.scrollTo(0,0);
  }catch(e){loadError('Customer',e,'customers',token);}
}
async function saveCustomer(form){
  await submit(form,async()=>{
    const name=value('customer_name'),phone=value('customer_phone'),email=value('customer_email');if(!name)throw new Error('Enter the customer’s name.');if(phone&&!customerPhone(phone))throw new Error('Enter a UK phone number starting with 0, or an international number starting with + and its country code.');if(email&&!validCustomerEmail(email))throw new Error('Enter a valid email address.');
    const row=await saveEntity('customers',form.dataset.id||null,{name,phone,email,address:value('customer_address'),postcode:value('customer_postcode').toUpperCase(),notes:value('customer_notes')},form.dataset.requestId);
    if(form.isConnected){say('Customer saved.');await customerDetail(row.id);}
  });
}
async function customerDetail(id){
  const token=loading('Customer','customers');
  try{const [c,j]=await Promise.all([loadRows('customers'),loadRows('jobs')]);if(!current(token))return;customerRows=c;jobRows=j;const x=recordById(c,id,'Customer'),linked=j.filter(job=>String(job.customer_id)===String(id)),activeJobs=linked.filter(isActiveJob),pastJobs=linked.filter(job=>!isActiveJob(job));
    document.getElementById('main').innerHTML=`<h1>${esc(x.name||'Unnamed customer')}</h1><div class="actions"><button class="btn primary" data-id="${esc(id)}" onclick="newJob(null,this.dataset.id)">New job for customer</button><button class="btn secondary" data-id="${esc(id)}" onclick="newCustomer(this.dataset.id)">Edit customer</button><button class="btn secondary" onclick="go('customers')">All customers</button></div><div class="card"><h2>Contact details</h2><p>${esc(x.phone||'No phone recorded')}<br>${esc(x.email||'No email recorded')}</p>${x.address||x.postcode?`<p style="white-space:pre-wrap">${esc([x.address,x.postcode].filter(Boolean).join('\n'))}</p>`:'<p class="muted">No address recorded.</p>'}${customerContactLinks(x)}${x.phone&&!customerPhone(x.phone)?'<p class="muted">Edit the phone number to enable Call and WhatsApp.</p>':''}${x.email&&!validCustomerEmail(x.email)?'<p class="muted">Edit the email address to enable Email.</p>':''}${x.notes?`<h3 style="margin-top:20px">Notes</h3><p style="white-space:pre-wrap">${esc(x.notes)}</p>`:''}</div><div class="card"><h2>Current jobs</h2>${jobListMarkup(activeJobs,'No current jobs linked to this customer.')}</div><div class="card"><h2>Previous jobs</h2>${jobListMarkup(pastJobs,'No completed or cancelled jobs linked to this customer.')}</div>`;window.scrollTo(0,0);
  }catch(e){loadError('Customer',e,'customers',token);}
}

async function money(){
  const token=loading('Money','money');
  try{const [e,j]=await Promise.all([loadRows('expenses'),loadRows('jobs')]);if(!current(token))return;expenseRows=e;jobRows=j;const totals=businessTotals(j,e),rows=e.slice().sort((a,b)=>String(b.expense_date||b.created_at||'').localeCompare(String(a.expense_date||a.created_at||'')));
    document.getElementById('main').innerHTML=`<h1>Business money</h1><p class="muted">All recorded jobs and expenses. A practical overview, not tax or accounting software.</p>${moneyStats(totals)}${totalsNote(totals)}<div class="card"><div class="actions"><h2>Expenses</h2><button class="btn primary" onclick="newExpense()">New expense</button></div>${rows.length?rows.map(x=>`<div class="row"><b>${pounds(x.amount)}</b><p>${esc(x.description||'No description')}</p><p class="muted">${esc(x.category||'Category not recorded')} · ${esc(plainDate(x.expense_date))}</p><button class="btn secondary" data-id="${esc(x.id)}" onclick="newExpense(this.dataset.id)">Edit expense</button></div>`).join(''):'<p class="empty">No expenses yet. Record business spending such as tools, fixings and travel.</p>'}</div>`;
  }catch(e){loadError('Money',e,'money',token);}
}
async function newExpense(id=null){
  const token=loading(id==null?'New expense':'Edit expense','money');
  try{const rows=id==null?expenseRows:await loadRows('expenses');if(!current(token))return;expenseRows=rows;const x=id==null?{}:recordById(rows,id,'Expense'),category=x.category||'Other',legacy=!expenseCategories.includes(category);
    document.getElementById('main').innerHTML=`<h1>${id==null?'New expense':'Edit expense'}</h1><div class="card"><form data-id="${esc(id??'')}" data-request-id="${esc(newRequestId())}" data-original-category="${esc(x.category??'')}" onsubmit="event.preventDefault();saveExpense(this)">${field('expense_amount','Amount (£)',x.amount??'','number','required min="0.01" max="1000000" step="0.01" inputmode="decimal"')}<div class="field"><label for="expense_category">Category</label><select id="expense_category" required>${legacy?`<option selected>${esc(category)}</option>`:''}${expenseCategories.map(c=>`<option ${c===category?'selected':''}>${esc(c)}</option>`).join('')}</select></div>${textField('expense_description','Description',x.description??'','required maxlength="2000"')}${field('expense_date','Date paid',x.expense_date||(id==null?todayLondon():''),'date','required min="2000-01-01" max="2100-12-31"')}${id!=null&&!x.expense_date?'<div class="notice">This older expense has no spending date. Enter the date shown on your receipt or bank record.</div>':''}<p class="muted">Record actual business spending. This saves a record; it does not move money.</p><div class="form-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit">Save expense</button><button class="btn secondary" type="button" onclick="go('money')">Back to money</button>${id!=null?'<button class="btn secondary" type="button" onclick="deleteExpense(this.form)">Delete expense</button>':''}</div></form></div>`;window.scrollTo(0,0);
  }catch(e){loadError('Expense',e,'money',token);}
}
async function saveExpense(form){
  await submit(form,async()=>{
    const amount=moneyPennies(value('expense_amount'),'Expense amount',true),description=value('expense_description'),category=value('expense_category'),date=value('expense_date');
    if(amount<=0)throw new Error('Enter an expense greater than £0.');if(!description)throw new Error('Describe the expense.');
    if(!expenseCategories.includes(category))throw new Error('Choose one of the current expense categories before saving this older record.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Choose a valid expense date.');
    await saveEntity('expenses',form.dataset.id||null,{amount:amount/100,category,description,expense_date:date},form.dataset.requestId);
    if(form.isConnected){say('Expense saved.');await money();}
  });
}
async function deleteExpense(form){
  if(form.dataset.busy==='true')return;
  if(!confirm('Permanently delete this expense? It will be removed from the money totals. This cannot be undone.'))return;
  await submit(form,async()=>{await deleteEntity('expenses',form.dataset.id);if(form.isConnected){say('Expense deleted.');await money();}},true,false);
}
