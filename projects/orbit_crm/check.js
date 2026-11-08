
(() => {
  "use strict";
  const DB_NAME = "OrbitCRMDatabase", DB_VERSION = 2;
  const STORES = ["contacts","leads","deals","tasks","activities","companies","settings"];
  const STAGES_FOR_PIPELINE = ["Prospecting","Proposal","Negotiation","Won","Lost"];
  const LABELS = {contacts:"Contacts",leads:"Leads",deals:"Sales pipeline",tasks:"Tasks",activities:"Activities",companies:"Companies"};
  const fields = {
    contacts:[["name","Full name","text",true],["email","Email address","email",false],["phone","Phone number","tel",false],["company","Company","text",false],["position","Job title","text",false],["status","Status","select",true,["Active","Prospect","Inactive"]],["notes","Notes","textarea",false]],
    leads:[["name","Lead name","text",true],["email","Email address","email",false],["phone","Phone number","tel",false],["source","Source","select",false,["Website","Referral","Social media","Advertisement","Cold outreach","Other"]],["status","Status","select",true,["New","Contacted","Qualified","Unqualified","Converted"]],["value","Estimated value","number",false],["notes","Notes","textarea",false]],
    deals:[["title","Deal title","text",true],["company","Company","text",false],["contact","Primary contact","text",false],["value","Deal value","number",true],["stage","Stage","select",true,["Prospecting","Proposal","Negotiation","Won","Lost"]],["expectedClose","Expected close date","date",false],["notes","Notes","textarea",false]],
    tasks:[["title","Task title","text",true],["relatedTo","Related contact / company","text",false],["dueDate","Due date","date",true],["priority","Priority","select",true,["Low","Medium","High"]],["status","Status","select",true,["To do","In progress","Completed","Failed"]],["notes","Notes","textarea",false]],
    activities:[["type","Activity type","select",true,["Call","Meeting","Email","Follow-up","Note"]],["subject","Subject","text",true],["contact","Contact","text",false],["company","Company","text",false],["activityDate","Date","date",true],["outcome","Outcome / summary","textarea",false],["notes","Additional notes","textarea",false]],
    companies:[["name","Company name","text",true],["website","Website","url",false],["industry","Industry","text",false],["phone","Phone number","tel",false],["email","Email address","email",false],["address","Address","text",false],["status","Status","select",true,["Customer","Prospect","Partner","Inactive"]],["notes","Notes","textarea",false]]
  };
  let db, currentView="dashboard", editingId=null, charts={};
  const $ = (s) => document.querySelector(s);
  const money = (n) => new Intl.NumberFormat(undefined,{style:"currency",currency:$("#currency")?.value||"USD",maximumFractionDigits:0}).format(Number(n)||0);
  const today = () => new Date().toISOString().slice(0,10);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(16).slice(2));
  function toast(message, type="success") { const el=document.createElement("div"); el.className=`alert alert-${type} shadow-lg`; el.innerHTML=`<span class="material-symbols-rounded">${type==="error"?"error":"check_circle"}</span><span>${escapeHtml(message)}</span>`; $("#toast-area").append(el); setTimeout(()=>el.remove(),3200); }
  function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result; STORES.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:"id"});});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name);}
  function getAll(name){return new Promise((resolve,reject)=>{const r=store(name).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
  function put(name,item){return new Promise((resolve,reject)=>{const r=store(name,"readwrite").put(item);r.onsuccess=()=>resolve(item);r.onerror=()=>reject(r.error);});}
  function remove(name,id){return new Promise((resolve,reject)=>{const r=store(name,"readwrite").delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
  async function all(name){return getAll(name);}
  async function records(name){return (await all(name)).sort((a,b)=>(b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""));}
  function setView(view){currentView=view; document.querySelectorAll("[id^='view-']").forEach(x=>x.classList.add("hidden")); const target=$("#view-"+(view==="dashboard"?"dashboard":view==="pipeline"?"pipeline":view==="reports"?"reports":view==="settings"?"settings":"records"));target.classList.remove("hidden");document.querySelectorAll("#main-nav a").forEach(a=>a.classList.toggle("active",a.dataset.view===view));$("#page-title").textContent=view==="dashboard"?"Dashboard":view==="pipeline"?"Sales pipeline":view==="reports"?"Reports & analytics":view==="settings"?"Settings":LABELS[view]||view;$("#page-subtitle").textContent=({dashboard:"A clear view of your customer relationships and sales.",pipeline:"Track every opportunity from first contact to close.",activities:"Log calls, meetings, emails, and customer follow-ups.",reports:"Understand your sales performance and team activity.",settings:"Manage your workspace and data backups."})[view]||`Manage your ${LABELS[view]?.toLowerCase()||"records"}.`;$("#table-search").value="";$("#status-filter").value=""; if(view==="dashboard")renderDashboard(); if(["contacts","leads","activities","companies"].includes(view)){ $("#tasks-board").classList.add("hidden"); $("#records-table-card").classList.remove("hidden"); renderTable(); } if(view==="tasks"){ $("#tasks-board").classList.remove("hidden"); $("#records-table-card").classList.add("hidden"); renderTasksBoard(); } if(view==="pipeline")renderPipeline();if(view==="reports")renderReports();if(view==="settings")renderSettings();$("#app-drawer").checked=false;}
  function statusBadge(value){const v=String(value||"");const cls=/won|completed|active|customer|converted/i.test(v)?"badge-success":/lost|inactive|unqualified/i.test(v)?"badge-error":/negotiation|progress|qualified|proposal|contacted/i.test(v)?"badge-warning":"badge-ghost";return `<span class="badge ${cls} badge-sm">${escapeHtml(v||"—")}</span>`;}
  function iconStat(icon,label,value,sub){return `<div class="stat rounded-2xl border border-base-300 bg-base-100"><div class="stat-figure rounded-xl bg-primary/10 p-3 text-primary"><span class="material-symbols-rounded">${icon}</span></div><div class="stat-title">${label}</div><div class="stat-value text-2xl">${value}</div><div class="stat-desc">${sub}</div></div>`;}
  async function renderDashboard(){
    const [contacts,leads,deals,tasks]=await Promise.all(["contacts","leads","deals","tasks"].map(all));
    const won=deals.filter(d=>d.stage==="Won"), revenue=won.reduce((s,d)=>s+(+d.value||0),0), open=deals.filter(d=>!["Won","Lost"].includes(d.stage)).reduce((s,d)=>s+(+d.value||0),0);
    $("#stat-cards").innerHTML=iconStat("payments","Total revenue",money(revenue),"From won deals")+iconStat("groups","Total contacts",contacts.length,"People in your CRM")+iconStat("person_search","Open leads",leads.filter(l=>!["Converted","Unqualified"].includes(l.status)).length,"Active opportunities")+iconStat("trending_up","Pipeline value",money(open),"Deals not yet closed");
    $("#nav-contacts").textContent=contacts.length;
    const recent=contacts.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,5);
    $("#recent-contacts").innerHTML=recent.length?`<table class="table table-sm"><tbody>${recent.map(c=>`<tr><td><div class="font-medium">${escapeHtml(c.name)}</div><div class="text-xs text-base-content/50">${escapeHtml(c.email||"No email")}</div></td><td>${escapeHtml(c.company||"—")}</td><td>${statusBadge(c.status)}</td></tr>`).join("")}</tbody></table>`:`<p class="py-6 text-center text-sm text-base-content/50">No contacts yet. Add your first contact.</p>`;
    const upcoming=tasks.filter(t=>t.status!=="Completed").sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||"")).slice(0,5);
    $("#upcoming-tasks").innerHTML=upcoming.length?upcoming.map(t=>`<div class="flex items-center justify-between gap-3"><div class="min-w-0"><div class="truncate text-sm font-medium">${escapeHtml(t.title)}</div><div class="text-xs text-base-content/50">${escapeHtml(t.dueDate||"No due date")} · ${escapeHtml(t.relatedTo||"General")}</div></div>${statusBadge(t.priority)}</div>`).join(""):`<p class="py-6 text-center text-sm text-base-content/50">No upcoming tasks.</p>`;
    const monthLabels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], monthly=Array(12).fill(0);won.forEach(d=>{const dt=new Date(d.updatedAt||d.createdAt||Date.now());monthly[dt.getMonth()]+=+d.value||0;});
    makeChart("revenue-chart",{type:"bar",data:{labels:monthLabels,datasets:[{label:"Revenue",data:monthly,borderRadius:7,backgroundColor:"#6366f1"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"#e5e7eb"}},x:{grid:{display:false}}}}});
    const statuses=["New","Contacted","Qualified","Unqualified","Converted"],counts=statuses.map(s=>leads.filter(l=>l.status===s).length);
    makeChart("lead-chart",{type:"doughnut",data:{labels:statuses,datasets:[{data:counts,backgroundColor:["#6366f1","#0ea5e9","#14b8a6","#f59e0b","#22c55e"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:"68%"}});
    $("#lead-legend").innerHTML=statuses.map((s,i)=>`<div class="flex items-center justify-between text-sm"><span class="flex items-center gap-2"><span class="size-2.5 rounded-full" style="background:${["#6366f1","#0ea5e9","#14b8a6","#f59e0b","#22c55e"][i]}"></span>${s}</span><b>${counts[i]}</b></div>`).join("");
  }
  function makeChart(id,config){if(charts[id])charts[id].destroy();const canvas=document.getElementById(id);if(canvas)charts[id]=new Chart(canvas,config);}
  function columnsFor(view){return view==="contacts"?["name","email","phone","company","status"]:view==="leads"?["name","source","email","value","status"]:view==="tasks"?["title","relatedTo","dueDate","priority","status"]:view==="activities"?["type","subject","contact","company","activityDate"]:["name","industry","email","phone","status"];}
  function nice(k){return ({name:"Name",email:"Email",phone:"Phone",company:"Company",status:"Status",source:"Source",value:"Value",title:"Task",relatedTo:"Related to",dueDate:"Due date",priority:"Priority",industry:"Industry",type:"Type",subject:"Subject",contact:"Contact",activityDate:"Date"})[k]||k;}
  async function renderTable(){
    const view=currentView, rows=await records(view), cols=columnsFor(view), query=($("#table-search").value||"").toLowerCase(), status=$("#status-filter").value;
    const statusKey=["leads","contacts","companies","tasks"].includes(view)?"status":null;
    const options=[...new Set(rows.map(r=>r[statusKey]).filter(Boolean))];
    $("#status-filter").innerHTML='<option value="">All statuses</option>'+options.map(x=>`<option>${escapeHtml(x)}</option>`).join("");$("#status-filter").value=status;
    const filtered=rows.filter(r=>(!status||r[statusKey]===status)&&cols.some(k=>String(r[k]??"").toLowerCase().includes(query)));
    $("#table-head").innerHTML=`<tr>${cols.map(c=>`<th>${nice(c)}</th>`).join("")}<th class="text-right">Actions</th></tr>`;
    $("#table-body").innerHTML=filtered.map(r=>`<tr>${cols.map(c=>`<td>${c==="status"?`<select class="select select-bordered select-sm min-w-32 bg-base-100" data-inline-status="${escapeHtml(r.id)}" aria-label="Select status to update">${(fields[view].find(f=>f[0]==="status")?.[4]||[]).map(option=>`<option value="${escapeHtml(option)}" ${r.status===option?"selected":""}>${escapeHtml(option)}</option>`).join("")}</select>`:c==="priority"?statusBadge(r[c]):c==="value"?money(r[c]):`<span class="max-w-48 truncate">${escapeHtml(r[c]||"—")}</span>`}</td>`).join("")}<td><div class="flex justify-end gap-1"><button class="btn btn-ghost btn-xs" data-edit="${r.id}" aria-label="Edit"><span class="material-symbols-rounded text-lg">edit</span></button><button class="btn btn-ghost btn-xs text-error" data-delete="${r.id}" aria-label="Delete"><span class="material-symbols-rounded text-lg">delete</span></button></div></td></tr>`).join("");
    $("#empty-state").classList.toggle("hidden",filtered.length>0);
  }
  async function renderTasksBoard(){
    const tasks=await records("tasks");
    const stages=["To do","In progress","Completed","Failed"];
    const query=($("#table-search").value||"").trim().toLowerCase();
    const priorityClass=p=>p==="High"?"badge-error":p==="Medium"?"badge-warning":"badge-ghost";
    $("#tasks-board").innerHTML=stages.map(stage=>{
      const list=tasks.filter(task=>task.status===stage && (!query || [task.title,task.relatedTo,task.notes,task.priority].some(v=>String(v||"").toLowerCase().includes(query))));
      const cards=list.map(task=>`
        <article class="card cursor-grab border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
          draggable="true" data-task-id="${escapeHtml(task.id)}">
          <div class="card-body gap-3 p-4">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-semibold">${escapeHtml(task.title||"Untitled task")}</h4>
              <span class="badge ${priorityClass(task.priority)} badge-sm">${escapeHtml(task.priority||"Normal")}</span>
            </div>
            ${task.relatedTo?`<p class="text-xs text-base-content/60">${escapeHtml(task.relatedTo)}</p>`:""}
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs text-base-content/60">${task.dueDate?`Due ${escapeHtml(task.dueDate)}`:"No due date"}</span>
              <button class="btn btn-ghost btn-xs" type="button" data-edit-task="${escapeHtml(task.id)}">Edit</button>
            </div>
          </div>
        </article>`).join("");
      return `<section class="min-h-64 min-w-0 rounded-2xl border border-base-300 bg-base-200/60 p-3 transition-colors" data-task-stage="${stage}">
        <header class="mb-3 flex items-center justify-between gap-2"><h3 class="font-semibold">${stage}</h3><span class="badge badge-ghost">${list.length}</span></header>
        <div class="min-h-48 space-y-3" data-task-drop="${stage}">${cards||'<p class="py-8 text-center text-xs text-base-content/45">Drop tasks here</p>'}</div>
      </section>`;
    }).join("");
  }

  async function renderPipeline(){
    const deals=await records("deals");
    const stages=["Prospecting","Proposal","Negotiation","Won","Lost"];
    $("#pipeline-board").innerHTML=stages.map(stage=>{
      const list=deals.filter(d=>d.stage===stage);
      const cards=list.map(d=>`
        <div class="card cursor-grab border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
             draggable="true" data-deal-id="${escapeHtml(d.id)}">
          <div class="card-body gap-2 p-4">
            <div class="font-semibold">${escapeHtml(d.title)}</div>
            <div class="text-xs text-base-content/50">${escapeHtml(d.company||d.contact||"No company")}</div>
            <div class="font-bold text-primary">${money(d.value)}</div>
            <div class="flex justify-between gap-2">
              <span class="text-xs text-base-content/50">${escapeHtml(d.expectedClose||"No close date")}</span>
              <button class="btn btn-ghost btn-xs" data-edit-deal="${escapeHtml(d.id)}">Edit</button>
            </div>
          </div>
        </div>`).join("");
      return `
        <div class="min-h-52 w-72 min-w-72 shrink-0 rounded-2xl border border-base-300 bg-base-200/70 p-3 transition-colors"
             data-pipeline-stage="${stage}">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold">${stage}</h3>
            <span class="badge badge-ghost">${list.length}</span>
          </div>
          <div class="min-h-36 space-y-3" data-drop-zone="${stage}">
            ${cards||'<p class="py-6 text-center text-xs text-base-content/40">Drop deals here</p>'}
          </div>
        </div>`;
    }).join("");
  }
  async function renderReports(){const [deals,leads,contacts]=await Promise.all(["deals","leads","contacts"].map(all));const won=deals.filter(d=>d.stage==="Won"),total=deals.reduce((s,d)=>s+(+d.value||0),0);$("#report-stats").innerHTML=iconStat("payments","Won revenue",money(won.reduce((s,d)=>s+(+d.value||0),0)),`${won.length} closed-won deals`)+iconStat("conversion_path","Lead conversion",leads.length?Math.round(leads.filter(l=>l.status==="Converted").length/leads.length*100)+"%":"0%","Converted leads / all leads")+iconStat("groups","Contacts",contacts.length,"Total saved contacts");const stages=["Prospecting","Proposal","Negotiation","Won","Lost"];makeChart("stage-chart",{type:"bar",data:{labels:stages,datasets:[{data:stages.map(s=>deals.filter(d=>d.stage===s).length),backgroundColor:"#6366f1",borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});makeChart("conversion-chart",{type:"doughnut",data:{labels:["Converted","Not converted"],datasets:[{data:[leads.filter(l=>l.status==="Converted").length,leads.filter(l=>l.status!=="Converted").length],backgroundColor:["#14b8a6","#cbd5e1"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});}
  async function renderSettings(){const s=(await all("settings"))[0]||{};$("#workspace-name").value=s.workspaceName||"Orbit CRM";$("#owner-name").value=s.ownerName||"";$("#currency").value=s.currency||"USD";$("#storage-count").textContent=(await Promise.all(STORES.filter(x=>x!=="settings").map(async x=>(await all(x)).length))).reduce((a,b)=>a+b,0);}
  function fieldHtml(f,data={}){const [key,label,type,required,opts]=f,val=data[key]??"";let control="";if(type==="select")control=`<select name="${key}" class="select select-bordered w-full" ${required?"required":""}><option value="">Choose ${label.toLowerCase()}</option>${opts.map(o=>`<option ${val===o?"selected":""}>${o}</option>`).join("")}</select>`;else if(type==="textarea")control=`<textarea name="${key}" class="textarea textarea-bordered w-full" rows="3">${escapeHtml(val)}</textarea>`;else control=`<input name="${key}" type="${type}" value="${escapeHtml(val)}" class="input input-bordered w-full" ${required?"required":""} ${type==="number"?'min="0" step="0.01"':""}>`;return `<label class="form-control ${type==="textarea"?"sm:col-span-2":""}"><span class="label-text mb-1">${label}${required?' <span class="text-error">*</span>':""}</span>${control}</label>`;}
  async function openForm(view,id=null){const config=fields[view];if(!config)return;editingId=id;const existing=id?await new Promise((res,rej)=>{const r=store(view).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}):{};$("#modal-title").textContent=(id?"Edit ":"Add ")+(LABELS[view]||view).replace(" & activities","");$("#form-fields").innerHTML=config.map(f=>fieldHtml(f,existing||{})).join("");$("#record-modal").dataset.store=view;$("#record-modal").showModal();}
  async function saveForm(e){
    e.preventDefault();
    const view=$("#record-modal").dataset.store;
    try {
      const form=new FormData(e.target);
      const item={id:editingId||uid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      for(const [k,v] of form.entries()) item[k]=v;
      if(editingId){
        const old=await new Promise((resolve,reject)=>{
          const r=store(view).get(editingId);
          r.onsuccess=()=>resolve(r.result);
          r.onerror=()=>reject(r.error);
        });
        item.createdAt=old?.createdAt||item.createdAt;
      }
      await put(view,item);
      $("#record-modal").close();
      e.target.reset();
      toast("Record saved successfully.");
      await refreshCurrent();
    } catch(err) {
      console.error("CRM save failed:",err);
      toast("Unable to save. Please check browser storage permissions and try again.","error");
    }
  }
  async function deleteRecord(view,id){if(!confirm("Delete this record? This action cannot be undone."))return;await remove(view,id);toast("Record deleted.");refreshCurrent();}
  function refreshCurrent(){if(currentView==="dashboard")renderDashboard();else if(currentView==="pipeline")renderPipeline();else if(currentView==="tasks")renderTasksBoard();else if(currentView==="reports")renderReports();else if(currentView==="settings")renderSettings();else renderTable();}
  async function exportData(){const data={app:"Orbit CRM",version:1,exportedAt:new Date().toISOString(),data:{}};for(const s of STORES)data.data[s]=await all(s);const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`orbit-crm-backup-${today()}.json`;a.click();URL.revokeObjectURL(url);toast("JSON backup downloaded.");}
  async function importData(file){if(!file)return;try{const data=JSON.parse(await file.text());if(!data.data)throw new Error("Invalid backup file");for(const s of STORES){if(Array.isArray(data.data[s]))for(const item of data.data[s])await put(s,item);}toast("Backup restored successfully.");refreshCurrent();}catch(e){toast("Could not restore this file. Please choose a valid CRM JSON backup.","error");}}
  async function loadDemo(){if(!confirm("Add sample records to your current CRM? Existing records will stay."))return;const now=new Date().toISOString();const samples={companies:[{name:"Northstar Studio",industry:"Design",email:"hello@northstar.example",status:"Customer"},{name:"Bluewave Commerce",industry:"E-commerce",email:"team@bluewave.example",status:"Prospect"}],contacts:[{name:"Alex Morgan",email:"alex@example.com",phone:"+1 555 0101",company:"Northstar Studio",position:"Marketing Director",status:"Active"},{name:"Jamie Lee",email:"jamie@example.com",phone:"+1 555 0102",company:"Bluewave Commerce",position:"Founder",status:"Prospect"}],leads:[{name:"Taylor Reed",email:"taylor@example.com",source:"Website",status:"Qualified",value:4500},{name:"Casey Park",email:"casey@example.com",source:"Referral",status:"New",value:1800}],deals:[{title:"Website redesign",company:"Northstar Studio",contact:"Alex Morgan",value:8200,stage:"Won",expectedClose:today()},{title:"E-commerce setup",company:"Bluewave Commerce",contact:"Jamie Lee",value:5600,stage:"Proposal",expectedClose:today()}],tasks:[{title:"Send project proposal",relatedTo:"Jamie Lee",dueDate:today(),priority:"High",status:"To do"},{title:"Schedule kickoff call",relatedTo:"Alex Morgan",dueDate:today(),priority:"Medium",status:"In progress"}]};for(const [s,arr] of Object.entries(samples))for(const x of arr)await put(s,{...x,id:uid(),createdAt:now,updatedAt:now});toast("Sample data added.");refreshCurrent();}
  function refreshGlobalSearch(q){if(!q)return;const v=["contacts","leads","tasks","activities","companies"].find(x=>LABELS[x].toLowerCase().includes(q.toLowerCase()))||"contacts";setView(v);$("#table-search").value=q;renderTable();}
  document.addEventListener("click",async e=>{const nav=e.target.closest("[data-view]");if(nav){setView(nav.dataset.view);return;}const go=e.target.closest("[data-go]");if(go){setView(go.dataset.go);return;}const edit=e.target.closest("[data-edit]");if(edit){openForm(currentView,edit.dataset.edit);return;}const editDeal=e.target.closest("[data-edit-deal]");if(editDeal){openForm("deals",editDeal.dataset.editDeal);return;}const del=e.target.closest("[data-delete]");if(del){deleteRecord(currentView,del.dataset.delete);return;}});
  $("#table-body").addEventListener("change",async e=>{
    const selector=e.target.closest("[data-inline-status]");
    if(!selector) return;
    const id=selector.dataset.inlineStatus;
    const view=currentView;
    try {
      const existing=await new Promise((resolve,reject)=>{
        const request=store(view).get(id);
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      if(!existing) throw new Error("Record not found");
      existing.status=selector.value;
      existing.updatedAt=new Date().toISOString();
      await put(view,existing);
      toast("Status updated successfully.");
      if(view==="dashboard") await renderDashboard();
    } catch(err) {
      console.error("Inline status update failed:",err);
      toast("Could not update status. Please try again.","error");
      await renderTable();
    }
  });
  // Right-mouse-button drag scrolling. Assign scroll positions directly
  // (rather than scrollTo/animate) so scrolling tracks the pointer without lag.
  (function enableRightDragScroll(){
    const board=document.getElementById("pipeline-board");
    if(!board) return;
    let dragging=false, startX=0, startY=0, startLeft=0, startTop=0;
    const scrollingElement=document.scrollingElement || document.documentElement;

    board.addEventListener("contextmenu",event=>{
      if(dragging || event.target.closest("#pipeline-board")) event.preventDefault();
    });

    board.addEventListener("mousedown",event=>{
      if(event.button!==2) return;
      dragging=true;
      startX=event.clientX;
      startY=event.clientY;
      startLeft=board.scrollLeft;
      startTop=scrollingElement.scrollTop;
      board.classList.add("select-none");
      event.preventDefault();
    });

    window.addEventListener("mousemove",event=>{
      if(!dragging) return;
      const deltaX=event.clientX-startX;
      const deltaY=event.clientY-startY;
      board.scrollLeft=startLeft-deltaX;
      scrollingElement.scrollTop=Math.max(0,startTop-deltaY);
      event.preventDefault();
    },{passive:false});

    window.addEventListener("mouseup",event=>{
      if(event.button!==2 || !dragging) return;
      dragging=false;
      board.classList.remove("select-none");
    });

    window.addEventListener("contextmenu",event=>{
      if(dragging) event.preventDefault();
    });

    window.addEventListener("blur",()=>{
      dragging=false;
      board.classList.remove("select-none");
    });
  })();

  // Smooth horizontal scrolling: mouse wheel scrolls the board sideways.
  // Trackpads and touch devices retain their native horizontal scrolling behavior.
  window.jQuery("#pipeline-board").on("wheel", function(event) {
    const original=event.originalEvent;
    // Keep vertical wheel movement for the page. Only Shift+wheel or a
    // trackpad's native horizontal delta should move the pipeline sideways.
    const horizontalDelta=original.shiftKey
      ? (original.deltaY || original.deltaX)
      : original.deltaX;
    if(horizontalDelta) {
      const maxScroll=this.scrollWidth-this.clientWidth;
      if(maxScroll<=0) return;
      const next=this.scrollLeft + horizontalDelta * 1.8;
      if(next>=0 && next<=maxScroll) {
        event.preventDefault();
        window.jQuery(this).stop(true).animate(
          {scrollLeft:next},
          {duration:140,easing:"swing",queue:false}
        );
      } else if(next<0 || next>maxScroll) {
        event.preventDefault();
        this.scrollLeft=Math.max(0,Math.min(maxScroll,next));
      }
    }
  });

  // Hold and drag on empty pipeline space to pan horizontally and vertically.
  // Deal cards keep their native drag-and-drop behavior.
  const $pipelineBoard=window.jQuery("#pipeline-board");
  let panPressTimer=null, panActive=false, panStartX=0, panStartY=0;
  let panStartLeft=0, panStartTop=0, panPointerId=null;
  $pipelineBoard.on("pointerdown", function(event) {
    const e=event.originalEvent;
    if(e.pointerType!=="mouse" || e.button!==0) return;
    if(window.jQuery(e.target).closest("[data-deal-id],button,input,select,a").length) return;
    panPointerId=e.pointerId;
    panStartX=e.clientX;
    panStartY=e.clientY;
    panStartLeft=this.scrollLeft;
    panStartTop=window.scrollY;
    panActive=false;
    clearTimeout(panPressTimer);
    panPressTimer=setTimeout(()=>{
      panActive=true;
      this.classList.add("cursor-grabbing");
      document.body.classList.add("select-none");
    },180);
  });
  window.jQuery(document).on("pointermove.pipelinePan", function(event) {
    if(panPointerId===null) return;
    const e=event.originalEvent;
    if(!panActive && (Math.abs(e.clientX-panStartX)>7 || Math.abs(e.clientY-panStartY)>7)) {
      clearTimeout(panPressTimer);
      panPressTimer=null;
      return;
    }
    if(!panActive) return;
    event.preventDefault();
    const board=document.getElementById("pipeline-board");
    board.scrollLeft=panStartLeft-(e.clientX-panStartX);
    window.scrollTo({top:panStartTop-(e.clientY-panStartY),behavior:"auto"});
  }).on("pointerup.pipelinePan pointercancel.pipelinePan", function() {
    clearTimeout(panPressTimer);
    panPressTimer=null;
    panPointerId=null;
    if(panActive){
      document.getElementById("pipeline-board").classList.remove("cursor-grabbing");
      document.body.classList.remove("select-none");
    }
    panActive=false;
  });

  // Continuous edge auto-scroll while dragging: speed increases near the edge.
  const pipelineBoard=document.getElementById("pipeline-board");
  let pipelineDragX=null, pipelineScrollFrame=null;
  function stopPipelineAutoScroll(){
    pipelineDragX=null;
    if(pipelineScrollFrame!==null){
      cancelAnimationFrame(pipelineScrollFrame);
      pipelineScrollFrame=null;
    }
  }
  function pipelineAutoScrollTick(){
    if(pipelineDragX===null || !pipelineBoard || !pipelineBoard.isConnected){
      pipelineScrollFrame=null;
      return;
    }
    const bounds=pipelineBoard.getBoundingClientRect();
    const edgeZone=115;
    let velocity=0;
    const leftDistance=pipelineDragX-bounds.left;
    const rightDistance=bounds.right-pipelineDragX;
    if(leftDistance<edgeZone){
      const intensity=Math.max(0,Math.min(1,(edgeZone-leftDistance)/edgeZone));
      velocity=-(8+Math.pow(intensity,1.35)* thirtyPixelsPerFrame);
    } else if(rightDistance<edgeZone){
      const intensity=Math.max(0,Math.min(1,(edgeZone-rightDistance)/edgeZone));
      velocity=8+Math.pow(intensity,1.35)*thirtyPixelsPerFrame;
    }
    if(velocity!==0){
      pipelineBoard.scrollLeft+=velocity;
    }
    pipelineScrollFrame=requestAnimationFrame(pipelineAutoScrollTick);
  }
  const thirtyPixelsPerFrame=30;

  // jQuery-powered drag-and-drop for the sales pipeline.
  window.jQuery("#pipeline-board")
    .on("dragstart", "[data-deal-id]", function(event) {
      const e=event.originalEvent;
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain", this.dataset.dealId);
      window.jQuery(this).addClass("opacity-50");
    })
    .on("dragend", "[data-deal-id]", function() {
      stopPipelineAutoScroll();
      window.jQuery(this).removeClass("opacity-50");
      window.jQuery("[data-pipeline-stage]").removeClass("ring-2 ring-primary bg-primary/5");
    })
    .on("dragover", function(event) {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect="move";
      pipelineDragX=event.originalEvent.clientX;
      if(pipelineScrollFrame===null){
        pipelineScrollFrame=requestAnimationFrame(pipelineAutoScrollTick);
      }
    })
    .on("dragenter", "[data-pipeline-stage]", function(event) {
      event.preventDefault();
      window.jQuery(this).addClass("ring-2 ring-primary bg-primary/5");
    })
    .on("dragleave", "[data-pipeline-stage]", function(event) {
      if (!this.contains(event.relatedTarget)) {
        window.jQuery(this).removeClass("ring-2 ring-primary bg-primary/5");
      }
    })
    .on("drop", "[data-pipeline-stage]", async function(event) {
      event.preventDefault();
      stopPipelineAutoScroll();
      const targetStage=this.dataset.pipelineStage;
      const dealId=event.originalEvent.dataTransfer.getData("text/plain");
      window.jQuery("[data-pipeline-stage]").removeClass("ring-2 ring-primary bg-primary/5");
      if(!dealId || !STAGES_FOR_PIPELINE.includes(targetStage)) return;
      try {
        const deal=await new Promise((resolve,reject)=>{
          const request=store("deals").get(dealId);
          request.onsuccess=()=>resolve(request.result);
          request.onerror=()=>reject(request.error);
        });
        if(!deal || deal.stage===targetStage) return;
        deal.stage=targetStage;
        deal.updatedAt=new Date().toISOString();
        await put("deals",deal);
        toast(`Deal moved to ${targetStage}.`);
        await renderPipeline();
      } catch(err) {
        console.error("Pipeline drag-and-drop failed:",err);
        toast("Could not move this deal. Please try again.","error");
      }
    });

  // Drag tasks between To do, In progress, and Completed.
  window.jQuery("#tasks-board")
    .on("dragstart","[data-task-id]",function(event){
      event.originalEvent.dataTransfer.effectAllowed="move";
      event.originalEvent.dataTransfer.setData("text/plain",this.dataset.taskId);
      window.jQuery(this).addClass("opacity-50");
    })
    .on("dragend","[data-task-id]",function(){
      window.jQuery(this).removeClass("opacity-50");
      window.jQuery("[data-task-stage]").removeClass("ring-2 ring-primary bg-primary/5");
    })
    .on("dragover","[data-task-stage]",function(event){event.preventDefault();event.originalEvent.dataTransfer.dropEffect="move";})
    .on("dragenter","[data-task-stage]",function(event){event.preventDefault();window.jQuery(this).addClass("ring-2 ring-primary bg-primary/5");})
    .on("dragleave","[data-task-stage]",function(event){if(!this.contains(event.relatedTarget))window.jQuery(this).removeClass("ring-2 ring-primary bg-primary/5");})
    .on("drop","[data-task-stage]",async function(event){
      event.preventDefault();
      const taskId=event.originalEvent.dataTransfer.getData("text/plain");
      const nextStatus=this.dataset.taskStage;
      window.jQuery("[data-task-stage]").removeClass("ring-2 ring-primary bg-primary/5");
      if(!taskId || !["To do","In progress","Completed","Failed"].includes(nextStatus))return;
      try{
        const task=await new Promise((resolve,reject)=>{
          const request=store("tasks").get(taskId);
          request.onsuccess=()=>resolve(request.result);
          request.onerror=()=>reject(request.error);
        });
        if(!task || task.status===nextStatus)return;
        task.status=nextStatus;
        task.updatedAt=new Date().toISOString();
        await put("tasks",task);
        toast(`Task moved to ${nextStatus}.`);
        await renderTasksBoard();
      }catch(error){console.error("Task drag-and-drop failed:",error);toast("Could not move task. Please try again.","error");}
    })
    .on("click","[data-edit-task]",function(){openForm("tasks",this.dataset.editTask);});

  $("#add-record").addEventListener("click",()=>openForm(currentView));$("#pipeline-add").addEventListener("click",()=>openForm("deals"));
  $("#pipeline-help").addEventListener("click",()=>$("#pipeline-help-modal").showModal());
  $("#close-pipeline-help").addEventListener("click",()=>$("#pipeline-help-modal").close());
  $("#got-it-pipeline-help").addEventListener("click",()=>$("#pipeline-help-modal").close());$("#quick-add").addEventListener("click",()=>$("#quick-add-modal").showModal());
  $("#close-quick-add").addEventListener("click",()=>$("#quick-add-modal").close());
  $("#cancel-quick-add").addEventListener("click",()=>$("#quick-add-modal").close());
  $("#quick-add-form").addEventListener("submit",e=>{e.preventDefault();const v=$("#quick-add-type").value;$("#quick-add-modal").close();if(fields[v])openForm(v);});$("#quick-add-task").addEventListener("click",()=>openForm("tasks"));$("#record-form").addEventListener("submit",saveForm);$("#cancel-modal").addEventListener("click",()=>$("#record-modal").close());$("#table-search").addEventListener("input",()=>currentView==="tasks"?renderTasksBoard():renderTable());$("#status-filter").addEventListener("change",renderTable);$("#settings-export").addEventListener("click",exportData);$("#settings-import").addEventListener("click",()=>$("#import-file").click());$("#import-file").addEventListener("change",e=>importData(e.target.files[0]));$("#load-demo").addEventListener("click",loadDemo);$("#open-search").addEventListener("click",()=>{$("#search-modal").showModal();setTimeout(()=>$("#global-search").focus(),50);});
  $("#close-search").addEventListener("click",()=>$("#search-modal").close());
  $("#global-search").addEventListener("keydown",e=>{if(e.key==="Enter"){const q=e.target.value.trim();$("#search-modal").close();refreshGlobalSearch(q);}});$("#settings-form").addEventListener("submit",async e=>{e.preventDefault();await put("settings",{id:"preferences",workspaceName:$("#workspace-name").value,ownerName:$("#owner-name").value,currency:$("#currency").value,updatedAt:new Date().toISOString()});toast("Preferences saved.");});$("#date-label").textContent=new Intl.DateTimeFormat(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(new Date());
  (async()=>{try{db=await openDB();await renderDashboard();}catch(e){console.error(e);toast("IndexedDB could not be opened in this browser.","error");}})();
})();
