// FACILITY OPS v0.4.5 — SERVICE DESK
// Rollback baseline: f824a9ca24f2a494af44315188c0fc13aefdd04d
// Isolated frontend layer. No DB schema mutation.
(function(){
  'use strict';
  if(window.__FACILITY_OPS_V045__) return;
  window.__FACILITY_OPS_V045__ = true;

  const MARK='[SERVICE_DESK_V045]';
  const ADMIN_MARK='[ADMIN_NOTE]';
  const PHASES=[
    ['received','접수됨'],
    ['checking','확인중'],
    ['scheduled','조치예정'],
    ['progress','조치중'],
    ['done','완료']
  ];
  const PHASE_LABEL=Object.fromEntries(PHASES);
  const PROBLEM_TYPES=['조명','전기','냉난방','문·잠금','누수·배수','화장실','가구·비품','청소·환경','소음','기타'];
  let busy=false;

  function profile(){try{return currentProfile||window.currentProfile||null}catch(_){return window.currentProfile||null}}
  function userId(){try{return currentUser?.id||window.currentUser?.id||''}catch(_){return window.currentUser?.id||''}}
  function active(){
    const p=profile(); return !!p && p.approved!==false && (!p.account_status||p.account_status==='active');
  }
  function admin(){
    const p=profile(); return active() && p?.role==='admin';
  }
  function member(){const p=profile();return active() && p?.role!=='viewer'}
  function esc45(v){
    if(typeof esc==='function') return esc(v??'');
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function today(){try{return todayISO()}catch(_){return new Date().toISOString().slice(0,10)}}
  function fmt(d){try{return formatDate(d)}catch(_){return d||'-'}}
  function phaseToStatus(phase){return phase==='done'?'done':phase==='progress'?'progress':'open'}
  function phaseIndex(phase){const i=PHASES.findIndex(x=>x[0]===phase);return i<0?0:i}
  function issueList(){try{return Array.isArray(state?.issues)?state.issues:[]}catch(_){return []}}
  function facilities(){try{return Array.isArray(state?.facilities)?state.facilities:[]}catch(_){return []}}
  function facilityLabel(id){
    if(!id)return '미연결';
    const f=facilities().find(x=>x.id===id);
    return f?`${f.name} · ${f.location}`:'미연결';
  }
  function cleanLine(v,max=120){return String(v??'').replace(/[\r\n=]/g,' ').trim().slice(0,max)}
  function cleanBody(v,max=900){return String(v??'').replaceAll(ADMIN_MARK,'[관리자 메모]').trim().slice(0,max)}
  function parseMeta(note){
    const raw=String(note||'');
    if(!raw.startsWith(MARK)) return null;
    const split=raw.split(ADMIN_MARK);
    const main=split[0], adminNote=(split.slice(1).join(ADMIN_MARK)||'').trim();
    const location=(main.match(/^장소=(.*)$/m)?.[1]||'').trim();
    const type=(main.match(/^유형=(.*)$/m)?.[1]||'기타').trim();
    const phase=(main.match(/^단계=(.*)$/m)?.[1]||'received').trim();
    const desc=(main.split('신고내용:\n')[1]||'').trim();
    return {location,type,phase:PHASE_LABEL[phase]?phase:'received',description:desc,adminNote};
  }
  function buildNote(meta){
    return `${MARK}\n장소=${cleanLine(meta.location,100)}\n유형=${cleanLine(meta.type,50)}\n단계=${PHASE_LABEL[meta.phase]?meta.phase:'received'}\n신고내용:\n${cleanBody(meta.description,900)}\n${ADMIN_MARK}\n${cleanBody(meta.adminNote,650)}`.slice(0,1950);
  }
  function serviceTickets(){return issueList().filter(i=>parseMeta(i.note))}
  function mine(){
    const uid=userId();
    return serviceTickets().filter(i=>i.createdBy===uid).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  function toast45(msg){
    try{if(typeof toast==='function'){toast(msg);return}}catch(_){}
    alert(msg);
  }

  function style(){
    if(document.getElementById('facilityOpsV045Style'))return;
    const s=document.createElement('style');s.id='facilityOpsV045Style';s.textContent=`
      .v045-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:14px;margin-bottom:14px}
      .v045-report-panel,.v045-my-panel,.v045-admin-panel,.v045-admin-summary{border:1px solid var(--line);background:linear-gradient(145deg,var(--panel),color-mix(in srgb,var(--panel-2) 58%,var(--panel)));border-radius:var(--radius);box-shadow:var(--shadow)}
      .v045-report-panel,.v045-my-panel,.v045-admin-panel{padding:20px}.v045-kicker{font-size:9px;font-weight:800;letter-spacing:.16em;color:var(--accent-2)}.v045-report-panel h2,.v045-my-panel h3,.v045-admin-panel h3{margin:6px 0 5px}.v045-report-panel p,.v045-my-panel p{margin:0;color:var(--muted);font-size:11px;line-height:1.55}
      .v045-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:18px}.v045-field{display:grid;gap:6px}.v045-field.full{grid-column:1/-1}.v045-field label{font-size:10px;color:var(--muted);font-weight:700}.v045-field input,.v045-field select,.v045-field textarea{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);color:var(--text);padding:10px 11px;outline:0}.v045-field textarea{min-height:100px;resize:vertical}.v045-field input:focus,.v045-field select:focus,.v045-field textarea:focus{border-color:color-mix(in srgb,var(--accent-2) 55%,var(--line));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent-2) 9%,transparent)}
      .v045-urgent{display:flex;align-items:center;gap:8px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);color:var(--soft);font-size:10px}.v045-urgent input{width:auto}.v045-submit{grid-column:1/-1;min-height:43px}
      .v045-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:16px}.v045-stat{padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2)}.v045-stat small{display:block;color:var(--muted);font-size:9px}.v045-stat strong{display:block;margin-top:6px;font-size:22px}
      .v045-ticket-list{display:grid;gap:10px;margin-top:14px}.v045-ticket{border:1px solid var(--line);border-radius:13px;background:var(--panel-2);padding:14px}.v045-ticket-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v045-ticket-title strong{display:block;font-size:13px}.v045-ticket-title small{display:block;margin-top:4px;color:var(--muted);font-size:9px}.v045-phase{display:inline-flex;align-items:center;gap:6px;border:1px solid color-mix(in srgb,var(--accent-2) 32%,var(--line));border-radius:999px;padding:5px 8px;font-size:9px;color:var(--accent-2);white-space:nowrap}.v045-desc{margin-top:10px;color:var(--soft);font-size:11px;line-height:1.55;white-space:pre-wrap}.v045-track{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:13px}.v045-step{position:relative;text-align:center;padding-top:16px;color:var(--muted);font-size:8px}.v045-step:before{content:"";position:absolute;top:3px;left:50%;width:8px;height:8px;border-radius:50%;transform:translateX(-50%);background:var(--panel-3);border:1px solid var(--line-strong);z-index:2}.v045-step:after{content:"";position:absolute;top:7px;left:-50%;width:100%;height:1px;background:var(--line)}.v045-step:first-child:after{display:none}.v045-step.done{color:var(--text)}.v045-step.done:before{background:var(--accent);border-color:var(--accent)}.v045-step.done:after{background:color-mix(in srgb,var(--accent) 58%,var(--line))}
      .v045-empty{padding:28px 12px;text-align:center;color:var(--muted);font-size:11px}
      .v045-admin-summary{padding:13px 15px;margin:0 0 14px;display:grid;grid-template-columns:auto repeat(5,1fr);gap:10px;align-items:center}.v045-admin-summary .lead strong{display:block;font-size:11px}.v045-admin-summary .lead small{font-size:8px;color:var(--muted)}.v045-admin-chip{border:1px solid var(--line);border-radius:10px;background:var(--panel-2);padding:9px 10px;text-align:left;color:var(--text)}.v045-admin-chip small{display:block;font-size:8px;color:var(--muted)}.v045-admin-chip strong{display:block;font-size:17px;margin-top:3px}
      .v045-admin-panel{margin-bottom:14px}.v045-admin-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:13px}.v045-admin-table-wrap{overflow:auto}.v045-admin-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1050px}.v045-admin-table th{font-size:9px;color:var(--muted);text-align:left;padding:9px 8px;border-bottom:1px solid var(--line)}.v045-admin-table td{font-size:10px;color:var(--soft);padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}.v045-admin-table tr:last-child td{border-bottom:0}.v045-admin-table select{max-width:150px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);color:var(--text);padding:6px 7px;font-size:9px}.v045-admin-table .request strong{display:block;color:var(--text);font-size:11px}.v045-admin-table .request small{display:block;margin-top:3px;color:var(--muted);font-size:8px;max-width:290px;white-space:normal;line-height:1.4}.v045-note-btn{border:1px solid var(--line);border-radius:8px;background:var(--panel-2);color:var(--soft);padding:6px 8px;font-size:9px}
      body.v045-reporter .nav-item[data-view="facilities"],body.v045-reporter .nav-item[data-view="inspections"],body.v045-reporter .nav-item[data-view="schedule"],body.v045-reporter #smartOps044,body.v045-reporter [data-v044-panel]{display:none!important}
      body.v045-reporter #exportBtn,body.v045-reporter #importInput{display:none!important}
      @media(max-width:1100px){.v045-hero{grid-template-columns:1fr}.v045-admin-summary{grid-template-columns:repeat(3,1fr)}.v045-admin-summary .lead{grid-column:1/-1}}
      @media(max-width:760px){.v045-form{grid-template-columns:1fr}.v045-field.full,.v045-submit{grid-column:1}.v045-stats{grid-template-columns:1fr 1fr}.v045-admin-summary{grid-template-columns:1fr 1fr}}
    `;document.head.appendChild(s);
  }

  function track(phase){
    const idx=phaseIndex(phase);
    return `<div class="v045-track">${PHASES.map((p,i)=>`<div class="v045-step ${i<=idx?'done':''}">${p[1]}</div>`).join('')}</div>`;
  }
  function phaseCount(tickets,phase){return tickets.filter(i=>parseMeta(i.note)?.phase===phase).length}

  async function refresh(){
    try{
      if(typeof loadRemoteData==='function') await loadRemoteData(false);
    }catch(err){console.warn('[SERVICE DESK refresh]',err)}
  }

  async function submitReport(e){
    e.preventDefault();
    if(busy)return;
    if(!member()){toast45('신고 등록 권한이 없습니다. 관리자에게 계정 권한을 확인해 주세요.');return}
    if(!dbClient){toast45('공용 DB 연결을 확인해 주세요.');return}
    const fd=new FormData(e.currentTarget);
    const location=String(fd.get('location')||'').trim();
    const type=String(fd.get('type')||'기타').trim();
    const title=String(fd.get('title')||'').trim();
    const description=String(fd.get('description')||'').trim();
    if(!location||!title||!description){toast45('장소, 문제 요약, 상세 내용을 입력해 주세요.');return}
    const urgent=fd.get('urgent')==='on';
    const row={
      facility_id:null,date:today(),completed_date:null,
      title:title.slice(0,180),
      severity:urgent?'high':'medium',status:'open',cost:0,
      note:buildNote({location,type,phase:'received',description,adminNote:''})
    };
    busy=true;
    const btn=e.currentTarget.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='신고 등록 중...'}
    try{
      const r=await dbClient.from('issues').insert(row);
      if(r.error)throw r.error;
      toast45('시설 신고가 접수되었습니다.');
      await refresh();
      renderReporterDesk();
    }catch(err){
      console.error('[SERVICE DESK submit]',err);toast45('신고 등록에 실패했습니다. '+(err?.message||''));
      if(btn){btn.disabled=false;btn.textContent='시설 신고 접수'}
    }finally{busy=false}
  }

  function locationOptions(){
    return [...new Set(facilities().map(f=>String(f.location||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  }

  function ticketCard(i){
    const m=parseMeta(i.note);
    return `<article class="v045-ticket">
      <div class="v045-ticket-head"><div class="v045-ticket-title"><strong>${esc45(i.title)}</strong><small>${esc45(m.location)} · ${esc45(m.type)} · ${fmt(i.date)}</small></div><span class="v045-phase">${PHASE_LABEL[m.phase]}</span></div>
      <div class="v045-desc">${esc45(m.description||'내용 없음')}</div>
      ${track(m.phase)}
    </article>`;
  }

  function renderReporterDesk(){
    document.body.classList.add('v045-reporter');
    const view=document.getElementById('view-issues');if(!view)return;
    try{document.getElementById('pageTitle').textContent='시설 신고'}catch(_){}
    const rows=mine();
    const activeCount=rows.filter(i=>parseMeta(i.note)?.phase!=='done').length;
    const doneCount=rows.length-activeCount;
    const locations=locationOptions();
    view.innerHTML=`
      <div class="section-head"><div><div class="v045-kicker">SERVICE DESK</div><h2>시설 신고</h2><p>시설명을 몰라도 괜찮습니다. 고장 난 장소와 증상만 알려주세요.</p></div><span class="count-pill">내 신고 ${rows.length}건</span></div>
      <div class="v045-hero">
        <section class="v045-report-panel"><div class="v045-kicker">NEW REQUEST</div><h2>어디가 불편한가요?</h2><p>장소와 문제를 간단히 적으면 시설 담당자가 확인 후 처리 상태를 업데이트합니다.</p>
          <form class="v045-form" id="v045ReportForm">
            <div class="v045-field"><label>장소 *</label><input name="location" list="v045Locations" maxlength="100" placeholder="예: 2층 어린이자료실" required><datalist id="v045Locations">${locations.map(x=>`<option value="${esc45(x)}"></option>`).join('')}</datalist></div>
            <div class="v045-field"><label>문제 유형</label><select name="type">${PROBLEM_TYPES.map(x=>`<option>${esc45(x)}</option>`).join('')}</select></div>
            <div class="v045-field full"><label>한 줄로 알려주세요 *</label><input name="title" maxlength="180" placeholder="예: 천장에서 물이 조금 떨어져요" required></div>
            <div class="v045-field full"><label>조금 더 자세히 *</label><textarea name="description" maxlength="900" placeholder="어느 위치에서, 어떤 문제가 있는지 적어주세요." required></textarea></div>
            <label class="v045-urgent full"><input type="checkbox" name="urgent"> 안전사고·누수·전기 문제 등 즉시 확인이 필요한 상황입니다.</label>
            <button class="primary-btn v045-submit" type="submit">시설 신고 접수</button>
          </form>
        </section>
        <aside class="v045-my-panel"><div class="v045-kicker">MY REQUESTS</div><h3>내 신고 현황</h3><p>담당자가 상태를 변경하면 여기에서 바로 확인할 수 있습니다.</p>
          <div class="v045-stats"><div class="v045-stat"><small>전체</small><strong>${rows.length}</strong></div><div class="v045-stat"><small>처리중</small><strong>${activeCount}</strong></div><div class="v045-stat"><small>완료</small><strong>${doneCount}</strong></div></div>
          <div class="v045-ticket-list">${rows.length?rows.slice(0,5).map(ticketCard).join(''):'<div class="v045-empty">아직 등록한 시설 신고가 없습니다.</div>'}</div>
        </aside>
      </div>
      ${rows.length>5?`<section class="v045-my-panel"><div class="v045-kicker">REQUEST HISTORY</div><h3>전체 신고 이력</h3><div class="v045-ticket-list">${rows.map(ticketCard).join('')}</div></section>`:''}`;
    document.getElementById('v045ReportForm')?.addEventListener('submit',submitReport);
  }

  function renderReporterDashboard(){
    document.body.classList.add('v045-reporter');
    const dash=document.getElementById('view-dashboard');if(!dash)return;
    try{document.getElementById('pageTitle').textContent='내 신고 현황'}catch(_){}
    const rows=mine(), latest=rows.slice(0,6);
    const rec=phaseCount(rows,'received'),checking=phaseCount(rows,'checking'),scheduled=phaseCount(rows,'scheduled'),progress=phaseCount(rows,'progress'),done=phaseCount(rows,'done');
    dash.innerHTML=`
      <div class="section-head"><div><div class="v045-kicker">SERVICE DESK</div><h2>내 신고 현황</h2><p>시설에 문제가 생기면 시설명을 찾지 말고 장소와 증상만 알려주세요.</p></div><button class="primary-btn" id="v045GoReport">+ 시설 신고</button></div>
      <div class="status-grid">
        <div class="status-card watch"><div class="label">접수됨</div><div class="value">${rec}</div><div class="sub">담당자 확인 대기</div></div>
        <div class="status-card repair"><div class="label">확인·예정</div><div class="value">${checking+scheduled}</div><div class="sub">현장 확인 또는 조치 준비</div></div>
        <div class="status-card alert"><div class="label">조치중</div><div class="value">${progress}</div><div class="sub">현재 처리 중</div></div>
        <div class="status-card normal"><div class="label">완료</div><div class="value">${done}</div><div class="sub">조치 완료</div></div>
      </div>
      <section class="v045-my-panel" style="margin-top:14px"><div class="panel-title"><div><div class="v045-kicker">RECENT REQUESTS</div><h3>최근 신고</h3></div><small>${rows.length}건</small></div>
      <div class="v045-ticket-list">${latest.length?latest.map(ticketCard).join(''):'<div class="v045-empty">아직 시설 신고가 없습니다.</div>'}</div></section>`;
    document.getElementById('v045GoReport')?.addEventListener('click',()=>go('issues'));
  }

  function adminTicketRows(tickets){
    const fs=facilities();
    return tickets.map(i=>{
      const m=parseMeta(i.note);
      return `<tr>
        <td>${fmt(i.date)}</td>
        <td class="request"><strong>${esc45(i.title)}</strong><small>${esc45(m.location)} · ${esc45(m.type)}<br>${esc45(m.description)}</small></td>
        <td><select data-v045-phase="${esc45(i.id)}">${PHASES.map(p=>`<option value="${p[0]}" ${m.phase===p[0]?'selected':''}>${p[1]}</option>`).join('')}</select></td>
        <td><select data-v045-severity="${esc45(i.id)}"><option value="low" ${i.severity==='low'?'selected':''}>낮음</option><option value="medium" ${i.severity==='medium'?'selected':''}>보통</option><option value="high" ${i.severity==='high'?'selected':''}>높음</option></select></td>
        <td><select data-v045-facility="${esc45(i.id)}"><option value="">시설 미연결</option>${fs.map(f=>`<option value="${esc45(f.id)}" ${i.facilityId===f.id?'selected':''}>${esc45(f.name)} · ${esc45(f.location)}</option>`).join('')}</select></td>
        <td><button class="v045-note-btn" data-v045-note="${esc45(i.id)}">${m.adminNote?'메모 수정':'관리 메모'}</button></td>
      </tr>`;
    }).join('');
  }

  function hideDuplicateServiceRows(view,tickets){
    const ids=new Set(tickets.map(x=>x.id));
    view.querySelectorAll('[data-edit-issue]').forEach(btn=>{if(ids.has(btn.dataset.editIssue))btn.closest('tr')?.remove()});
  }

  function mountAdminDesk(){
    document.body.classList.remove('v045-reporter');
    const view=document.getElementById('view-issues');if(!view)return;
    const tickets=serviceTickets().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    hideDuplicateServiceRows(view,tickets);
    view.querySelector('#v045AdminDesk')?.remove();
    const panel=document.createElement('section');panel.id='v045AdminDesk';panel.className='v045-admin-panel';
    panel.innerHTML=`<div class="v045-admin-head"><div><div class="v045-kicker">SERVICE REQUEST CENTER</div><h3>시설 신고 접수센터</h3><div style="font-size:9px;color:var(--muted);margin-top:4px">일반 사용자가 등록한 신고를 확인하고 처리 단계·우선순위·관련 시설을 지정합니다.</div></div><span class="count-pill">${tickets.length}건</span></div>
      <div class="v045-admin-table-wrap">${tickets.length?`<table class="v045-admin-table"><thead><tr><th>접수일</th><th>신고 내용</th><th>처리 단계</th><th>우선순위</th><th>관련 시설</th><th>내부 메모</th></tr></thead><tbody>${adminTicketRows(tickets)}</tbody></table>`:'<div class="v045-empty">접수된 시설 신고가 없습니다.</div>'}</div>`;
    const firstPanel=view.querySelector('.panel');if(firstPanel)view.insertBefore(panel,firstPanel);else view.appendChild(panel);
    panel.addEventListener('change',adminChange);
    panel.addEventListener('click',adminClick);
  }

  async function updateIssue(id,patch){
    if(busy||!admin()||!dbClient)return;
    busy=true;
    try{
      const r=await dbClient.from('issues').update(patch).eq('id',id);
      if(r.error)throw r.error;
      await refresh();
      patchedIssues();
    }catch(err){console.error('[SERVICE DESK admin update]',err);toast45('상태 변경에 실패했습니다. '+(err?.message||''))}
    finally{busy=false}
  }
  function findTicket(id){return issueList().find(x=>x.id===id)}
  function adminChange(e){
    const el=e.target;
    if(el.matches('[data-v045-phase]')){
      const i=findTicket(el.dataset.v045Phase),m=parseMeta(i?.note);if(!i||!m)return;
      m.phase=el.value;
      updateIssue(i.id,{status:phaseToStatus(m.phase),completed_date:m.phase==='done'?(i.completedDate||today()):null,note:buildNote(m)});
      return;
    }
    if(el.matches('[data-v045-severity]')){updateIssue(el.dataset.v045Severity,{severity:el.value});return}
    if(el.matches('[data-v045-facility]')){updateIssue(el.dataset.v045Facility,{facility_id:el.value||null});}
  }
  function adminClick(e){
    const btn=e.target.closest('[data-v045-note]');if(!btn)return;
    const i=findTicket(btn.dataset.v045Note),m=parseMeta(i?.note);if(!i||!m)return;
    const next=prompt('관리자 내부 메모\n(신고자 화면에는 표시되지 않습니다.)',m.adminNote||'');
    if(next===null)return;m.adminNote=String(next).slice(0,650);updateIssue(i.id,{note:buildNote(m)});
  }

  function mountAdminSummary(){
    if(!admin())return;
    const dash=document.getElementById('view-dashboard');if(!dash||!dash.classList.contains('active'))return;
    if(dash.querySelector('#v045AdminSummary'))return;
    const t=serviceTickets();
    const wrap=document.createElement('div');wrap.id='v045AdminSummary';wrap.className='v045-admin-summary';
    wrap.innerHTML=`<div class="lead"><strong>시설 신고 접수</strong><small>SERVICE DESK</small></div>${PHASES.map(p=>`<button class="v045-admin-chip" data-v045-open-desk="${p[0]}"><small>${p[1]}</small><strong>${phaseCount(t,p[0])}</strong></button>`).join('')}`;
    const anchor=dash.querySelector('#smartOps044');if(anchor?.nextSibling)dash.insertBefore(wrap,anchor.nextSibling);else dash.prepend(wrap);
    wrap.addEventListener('click',()=>go('issues'));
  }

  function go(view){
    try{if(typeof setView==='function'){setView(view);return}}catch(_){}
    const el=document.querySelector('[data-view="'+String(view).replace(/"/g,'')+'"]');if(el)el.click();
  }

  const originalIssues=typeof renderIssues==='function'?renderIssues:null;
  const originalDashboard=typeof renderDashboard==='function'?renderDashboard:null;

  function patchedIssues(){
    if(admin()){
      document.body.classList.remove('v045-reporter');
      if(originalIssues)originalIssues();
      mountAdminDesk();
    }else renderReporterDesk();
  }
  function patchedDashboard(){
    if(admin()){
      document.body.classList.remove('v045-reporter');
      if(originalDashboard)originalDashboard();
      setTimeout(mountAdminSummary,40);
    }else renderReporterDashboard();
  }

  try{renderIssues=patchedIssues;window.renderIssues=patchedIssues}catch(_){window.renderIssues=patchedIssues}
  try{renderDashboard=patchedDashboard;window.renderDashboard=patchedDashboard}catch(_){window.renderDashboard=patchedDashboard}

  function syncRoleUi(){
    const a=admin();
    document.body.classList.toggle('v045-reporter',active()&&!a);
    document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
      const v=btn.dataset.view,b=btn.querySelector('b');
      if(!a&&active()){
        if(['facilities','inspections','schedule'].includes(v))btn.style.display='none';
        else btn.style.display='';
        if(v==='issues'&&b&&b.textContent!=='시설 신고')b.textContent='시설 신고';
        if(v==='dashboard'&&b&&b.textContent!=='내 신고 현황')b.textContent='내 신고 현황';
      }else{
        btn.style.display='';
        const names={dashboard:'대시보드',facilities:'시설 관리',inspections:'점검 관리',issues:'고장 · 민원',schedule:'작업 일정'};
        if(b&&names[v]&&b.textContent!==names[v])b.textContent=names[v];
      }
    });
    document.querySelectorAll('.version').forEach(el=>{if(el.textContent!=='FACILITY OPS v0.4.5 SERVICE DESK')el.textContent='FACILITY OPS v0.4.5 SERVICE DESK'});
  }

  style();syncRoleUi();
  const obs=new MutationObserver(()=>{
    syncRoleUi();
    if(admin())setTimeout(mountAdminSummary,20);
  });
  if(document.body)obs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    if(!admin()&&active()&&e.target.closest('[data-add-type="issue"]')){e.preventDefault();e.stopImmediatePropagation();go('issues')}
  },true);

  setTimeout(()=>{
    syncRoleUi();
    try{
      if(document.getElementById('view-dashboard')?.classList.contains('active'))patchedDashboard();
      if(document.getElementById('view-issues')?.classList.contains('active'))patchedIssues();
    }catch(err){console.error('[FACILITY OPS v0.4.5 init]',err)}
  },160);
})();
