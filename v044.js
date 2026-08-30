// FACILITY OPS v0.4.4 — SMART OPS
// Isolated enhancement layer. No DB schema changes. Remove this file + loader to roll back.
(function(){
  'use strict';
  const VERSION='0.4.4';
  const DAY=86400000;
  let paletteIndex=0;
  let paletteItems=[];
  let mountQueued=false;

  function st(){try{return state||{facilities:[],inspections:[],issues:[],schedules:[]}}catch(_){return{facilities:[],inspections:[],issues:[],schedules:[]}}}
  function esc44(v){try{return esc(v)}catch(_){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}}
  function today(){try{return todayISO()}catch(_){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}}
  function parseDate(v){if(!v)return null;const d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?null:d}
  function daysFromToday(v){const d=parseDate(v),t=parseDate(today());return d&&t?Math.round((d-t)/DAY):null}
  function ageDays(v){const n=daysFromToday(v);return n==null?0:Math.max(0,-n)}
  function facility(id){return st().facilities.find(x=>x.id===id)||null}
  function facilityName(id){return facility(id)?.name||'-'}
  function recentIssueCount(fid,days=90){const cutoff=Date.now()-days*DAY;return st().issues.filter(x=>x.facilityId===fid&&parseDate(x.date)?.getTime()>=cutoff).length}
  function openIssues(fid){return st().issues.filter(x=>x.facilityId===fid&&x.status!=='done')}
  function unresolvedCost(fid){return openIssues(fid).reduce((a,x)=>a+(Number(x.cost)||0),0)}

  function health(f){
    if(!f)return{score:0,label:'정보없음',tone:'bad',reasons:['시설 정보 없음']};
    let score=100;const reasons=[];
    const statusPenalty={normal:0,watch:12,alert:28,repair:22}[f.status]??8;
    if(statusPenalty){score-=statusPenalty;reasons.push(`상태 ${f.status==='watch'?'주의':f.status==='alert'?'조치필요':f.status==='repair'?'수리중':f.status}`)}
    const due=daysFromToday(f.nextInspection);
    if(due!=null&&due<0){const p=Math.min(28,16+Math.floor(Math.abs(due)/7)*2);score-=p;reasons.push(`점검 ${Math.abs(due)}일 지연`)}
    else if(due!=null&&due<=3){score-=7;reasons.push(`점검 D-${Math.max(0,due)}`)}
    else if(due!=null&&due<=7){score-=3;reasons.push(`7일 내 점검`)}
    const unresolved=openIssues(f.id);
    let issuePenalty=0;
    unresolved.forEach(x=>{issuePenalty+=x.severity==='high'?16:x.severity==='mid'?9:5;if(ageDays(x.date)>=14)issuePenalty+=5});
    issuePenalty=Math.min(36,issuePenalty);if(issuePenalty){score-=issuePenalty;reasons.push(`미처리 ${unresolved.length}건`)}
    const repeat=recentIssueCount(f.id,90);if(repeat>=2){const p=Math.min(14,5+(repeat-2)*3);score-=p;reasons.push(`90일 반복 ${repeat}건`)}
    score=Math.max(0,Math.min(100,Math.round(score)));
    const label=score>=85?'양호':score>=70?'관찰':score>=50?'주의':'위험';
    const tone=score>=85?'good':score>=70?'fair':score>=50?'warn':'bad';
    return{score,label,tone,reasons,repeat,unresolved:unresolved.length,cost:unresolvedCost(f.id),due};
  }

  function healthSummary(){
    const rows=st().facilities.map(f=>({f,h:health(f)})).sort((a,b)=>a.h.score-b.h.score);
    const avg=rows.length?Math.round(rows.reduce((a,x)=>a+x.h.score,0)/rows.length):100;
    const risk=rows.filter(x=>x.h.score<70).length;
    return{rows,avg,risk};
  }

  function inspectionBuckets(){
    const b={overdue:[],today:[],d3:[],d7:[]};
    st().facilities.forEach(f=>{const d=daysFromToday(f.nextInspection);if(d==null)return;if(d<0)b.overdue.push(f);else if(d===0)b.today.push(f);else if(d<=3)b.d3.push(f);else if(d<=7)b.d7.push(f)});
    return b;
  }

  function priorities(){
    const rows=[];const now=today();
    st().issues.filter(x=>x.status!=='done').forEach(x=>{
      const f=facility(x.facilityId);let p=x.severity==='high'?100:x.severity==='mid'?82:66;
      if(x.status==='progress')p-=5;if(ageDays(x.date)>=14)p+=10;
      rows.push({p,type:'issue',icon:'!',title:x.title||'미처리 고장·민원',sub:`${f?.name||'-'} · ${ageDays(x.date)}일 경과`,tone:p>=95?'bad':'warn',view:'issues'});
    });
    st().facilities.forEach(f=>{
      const h=health(f);if(h.due!=null&&h.due<0)rows.push({p:96+Math.min(12,Math.floor(Math.abs(h.due)/7)),type:'facility',icon:'⌛',title:`점검 지연 · ${f.name}`,sub:`${Math.abs(h.due)}일 초과 · 건강도 ${h.score}`,tone:'bad',fid:f.id});
      if(h.repeat>=2)rows.push({p:88+h.repeat,type:'facility',icon:'↻',title:`반복 고장 감지 · ${f.name}`,sub:`최근 90일 ${h.repeat}건 · 건강도 ${h.score}`,tone:'warn',fid:f.id});
      if(h.score<50)rows.push({p:94,type:'facility',icon:'♥',title:`시설 건강도 위험 · ${f.name}`,sub:`${h.score}/100 · ${h.reasons.slice(0,2).join(' · ')}`,tone:'bad',fid:f.id});
    });
    st().schedules.filter(x=>x.status!=='done'&&x.date===now).forEach(x=>rows.push({p:78,type:'schedule',icon:'◷',title:`오늘 작업 · ${x.title||'작업 일정'}`,sub:`${x.type||'작업'} · ${facilityName(x.facilityId)}`,tone:'info',view:'schedule'}));
    return rows.sort((a,b)=>b.p-a.p).slice(0,8);
  }

  function injectStyle(){
    if(document.getElementById('facilityOpsV044Style'))return;
    const style=document.createElement('style');style.id='facilityOpsV044Style';style.textContent=`
      .sidebar .version{font-size:0!important}.sidebar .version::after{content:"FACILITY OPS v0.4.4 SMART OPS"!important;font-size:9px!important}
      .auth-logo p{font-size:0!important}.auth-logo p::after{content:"v0.4.4 · SMART OPS"!important;font-size:11px!important}
      .v044-smartbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.v044-smart-card{border:1px solid var(--line);background:linear-gradient(145deg,var(--panel),var(--panel-2));border-radius:11px;padding:12px 14px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;box-shadow:0 10px 24px rgba(0,0,0,.08);cursor:pointer}.v044-smart-card:hover{border-color:var(--line-strong);transform:translateY(-1px)}.v044-smart-icon{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent-2) 12%,var(--panel-2));color:var(--accent-2);font-weight:900}.v044-smart-card small{display:block;color:var(--muted);font-size:8px;letter-spacing:.08em}.v044-smart-card strong{display:block;font-size:17px;margin-top:3px}.v044-smart-card em{font-style:normal;font-size:8px;color:var(--muted)}
      .v044-panel{border:1px solid var(--line);background:linear-gradient(145deg,var(--panel),var(--panel-2));border-radius:12px;padding:15px;box-shadow:0 12px 30px rgba(0,0,0,.1)}.v044-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:11px}.v044-kicker{font-size:8px;letter-spacing:.17em;font-weight:800;color:var(--muted)}.v044-head h3{font-size:14px;margin:5px 0 0}.v044-head small{font-size:8px;color:var(--muted)}
      .v044-priority-list{display:grid;gap:7px}.v044-priority{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid var(--line);background:var(--panel-2);border-radius:9px;padding:9px 10px;cursor:pointer}.v044-priority:hover{border-color:var(--line-strong);background:var(--panel-3)}.v044-picon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-weight:900}.v044-picon.bad{color:var(--alert);background:color-mix(in srgb,var(--alert) 12%,transparent)}.v044-picon.warn{color:var(--watch);background:color-mix(in srgb,var(--watch) 12%,transparent)}.v044-picon.info{color:var(--accent-2);background:color-mix(in srgb,var(--accent-2) 12%,transparent)}.v044-priority strong{display:block;font-size:10px;color:var(--text)}.v044-priority small{display:block;font-size:8px;color:var(--muted);margin-top:3px}.v044-priority b{font-size:8px;color:var(--muted);font-weight:600}
      .v044-health-list{display:grid;gap:8px}.v044-health-row{display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:10px;align-items:center;cursor:pointer}.v044-health-row strong{display:block;font-size:9px}.v044-health-row small{display:block;color:var(--muted);font-size:8px;margin-top:2px}.v044-health-score{text-align:right;font-size:13px;font-weight:900}.v044-health-bar{height:5px;background:var(--panel-3);border-radius:999px;overflow:hidden;margin-top:5px}.v044-health-bar i{display:block;height:100%;border-radius:inherit;background:var(--normal)}.v044-health-row[data-tone="fair"] i{background:var(--accent-2)}.v044-health-row[data-tone="warn"] i{background:var(--watch)}.v044-health-row[data-tone="bad"] i{background:var(--alert)}
      .v044-radar{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.v044-radar-card{border:1px solid var(--line);background:var(--panel-2);border-radius:9px;padding:10px;cursor:pointer}.v044-radar-card:hover{border-color:var(--line-strong)}.v044-radar-card small{font-size:8px;color:var(--muted);display:block}.v044-radar-card strong{font-size:16px;display:block;margin-top:5px}.v044-radar-card.overdue strong{color:var(--alert)}.v044-radar-card.today strong{color:var(--watch)}
      .v044-health-badge{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:5px 8px;font-size:9px;font-weight:800;background:var(--panel-2)}.v044-health-badge.good{color:var(--normal)}.v044-health-badge.fair{color:var(--accent-2)}.v044-health-badge.warn{color:var(--watch)}.v044-health-badge.bad{color:var(--alert)}.v044-repeat{display:inline-flex;margin-left:5px;padding:3px 6px;border-radius:999px;border:1px solid color-mix(in srgb,var(--watch) 35%,var(--line));color:var(--watch);font-size:8px;font-weight:700;background:color-mix(in srgb,var(--watch) 7%,transparent)}
      .v044-detail-health strong.good{color:var(--normal)}.v044-detail-health strong.fair{color:var(--accent-2)}.v044-detail-health strong.warn{color:var(--watch)}.v044-detail-health strong.bad{color:var(--alert)}.v044-repeat-banner{margin-top:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--watch) 32%,var(--line));background:color-mix(in srgb,var(--watch) 6%,var(--panel-2));border-radius:10px;color:var(--soft);font-size:10px}.detail-metrics.v044-five{grid-template-columns:repeat(5,minmax(0,1fr))}
      .v044-search-trigger{min-height:38px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);color:var(--soft);padding:0 12px;display:flex;gap:12px;align-items:center;font-size:10px}.v044-search-trigger:hover{border-color:var(--line-strong);color:var(--text)}.v044-search-trigger kbd{border:1px solid var(--line);background:var(--panel-3);padding:2px 5px;border-radius:5px;color:var(--muted);font-size:8px}
      .v044-palette{position:fixed;inset:0;z-index:260;background:rgba(3,9,15,.66);backdrop-filter:blur(8px);display:grid;place-items:start center;padding-top:min(14vh,130px)}.v044-palette[hidden]{display:none}.v044-palette-card{width:min(720px,94vw);max-height:72vh;border:1px solid var(--line-strong);border-radius:16px;background:var(--panel);box-shadow:0 32px 100px rgba(0,0,0,.42);overflow:hidden}.v044-palette-input{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line);padding:10px 14px}.v044-palette-input span{font-size:20px;color:var(--muted)}.v044-palette-input input{width:100%;border:0;outline:0;background:transparent;color:var(--text);font-size:15px;min-height:40px}.v044-palette-input kbd{font-size:8px;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:3px 6px}.v044-results{max-height:56vh;overflow:auto;padding:8px}.v044-result{width:100%;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid transparent;background:transparent;color:var(--text);text-align:left;padding:9px 10px;border-radius:9px}.v044-result:hover,.v044-result.active{background:var(--panel-2);border-color:var(--line)}.v044-result-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:var(--panel-3);color:var(--accent-2);font-weight:900}.v044-result strong{display:block;font-size:11px}.v044-result small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.v044-result em{font-style:normal;font-size:8px;color:var(--muted)}.v044-result-group{padding:8px 10px 4px;color:var(--muted);font-size:8px;font-weight:800;letter-spacing:.13em}.v044-no-result{padding:30px;text-align:center;color:var(--muted);font-size:10px}
      body.light .v044-palette{background:rgba(214,225,236,.68)}body.light .v044-panel,body.light .v044-smart-card{box-shadow:0 10px 28px rgba(33,54,72,.07)}
      @media(max-width:1180px){.v044-smartbar{grid-template-columns:repeat(2,1fr)}.detail-metrics.v044-five{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.v044-smartbar{grid-template-columns:1fr 1fr}.v044-search-trigger span{display:none}.detail-metrics.v044-five{grid-template-columns:1fr 1fr}};
    document.head.appendChild(style);
  }

  function openFacility(fid){
    try{currentFacilityId=fid;currentFilter='all';currentLocationFilter='all';currentOverdueOnly=false;if(typeof setView==='function')setView('facilities');else document.querySelector('[data-view="facilities"]')?.click()}catch(_){document.querySelector('[data-view="facilities"]')?.click()}
  }
  function go(view){try{if(typeof setView==='function')setView(view);else document.querySelector(`[data-view="${view}"]`)?.click()}catch(_){document.querySelector(`[data-view="${view}"]`)?.click()}}
  function showOverdue(){try{currentFacilityId=null;currentFilter='all';currentLocationFilter='all';currentOverdueOnly=true;go('facilities')}catch(_){go('facilities')}}

  function mountDashboard(){
    const dash=document.getElementById('view-dashboard');if(!dash||!dash.classList.contains('active'))return;
    const old=dash.querySelector('#smartOps044');if(old)old.remove();dash.querySelectorAll('[data-v044-panel]').forEach(x=>x.remove());
    const hs=healthSummary(),b=inspectionBuckets(),prio=priorities();
    const repeats=hs.rows.filter(x=>x.h.repeat>=2).length;
    const bar=document.createElement('div');bar.id='smartOps044';bar.className='v044-smartbar';bar.innerHTML=`
      <div class="v044-smart-card" data-v044-action="health"><div class="v044-smart-icon">♥</div><div><small>FACILITY HEALTH</small><strong>${hs.avg}</strong></div><em>${hs.risk}개 주의</em></div>
      <div class="v044-smart-card" data-v044-action="priority"><div class="v044-smart-icon">⚡</div><div><small>PRIORITY QUEUE</small><strong>${prio.length}</strong></div><em>우선 확인</em></div>
      <div class="v044-smart-card" data-v044-action="repeat"><div class="v044-smart-icon">↻</div><div><small>REPEAT ISSUE</small><strong>${repeats}</strong></div><em>90일 기준</em></div>
      <div class="v044-smart-card" data-v044-action="inspection"><div class="v044-smart-icon">✓</div><div><small>INSPECTION RADAR</small><strong>${b.overdue.length+b.today.length}</strong></div><em>지연 + 오늘</em></div>`;
    const status=dash.querySelector('.status-grid');if(status)status.insertAdjacentElement('afterend',bar);else dash.prepend(bar);

    const left=dash.querySelector('.ops43-left');if(left){const p=document.createElement('section');p.className='v044-panel';p.dataset.v044Panel='priority';p.innerHTML=`<div class="v044-head"><div><div class="v044-kicker">SMART OPS / PRIORITY</div><h3>오늘 먼저 볼 것</h3></div><small>위험도 자동 계산</small></div><div class="v044-priority-list">${prio.length?prio.slice(0,5).map((x,i)=>`<div class="v044-priority" data-v044-priority="${i}"><span class="v044-picon ${x.tone}">${x.icon}</span><div><strong>${esc44(x.title)}</strong><small>${esc44(x.sub)}</small></div><b>P${x.p}</b></div>`).join(''):'<div class="ops43-empty">현재 우선 조치 항목이 없습니다.</div>'}</div>`;left.prepend(p)}

    const right=dash.querySelector('.ops43-right');if(right){
      const hp=document.createElement('section');hp.className='v044-panel';hp.dataset.v044Panel='health';hp.innerHTML=`<div class="v044-head"><div><div class="v044-kicker">FACILITY HEALTH</div><h3>건강도 낮은 시설</h3></div><small>0–100</small></div><div class="v044-health-list">${hs.rows.length?hs.rows.slice(0,5).map(x=>`<div class="v044-health-row" data-v044-fid="${esc44(x.f.id)}" data-tone="${x.h.tone}"><div><strong>${esc44(x.f.name)}</strong><small>${esc44(x.h.reasons.slice(0,2).join(' · ')||'특이사항 없음')}</small><div class="v044-health-bar"><i style="width:${x.h.score}%"></i></div></div><span class="v044-health-score">${x.h.score}</span></div>`).join(''):'<div class="ops43-empty">등록 시설이 없습니다.</div>'}</div>`;
      const rp=document.createElement('section');rp.className='v044-panel';rp.dataset.v044Panel='radar';rp.innerHTML=`<div class="v044-head"><div><div class="v044-kicker">INSPECTION RADAR</div><h3>점검 예정 자동 분류</h3></div><small>현재 기준</small></div><div class="v044-radar"><div class="v044-radar-card overdue" data-v044-bucket="overdue"><small>기한 초과</small><strong>${b.overdue.length}</strong></div><div class="v044-radar-card today" data-v044-bucket="today"><small>오늘</small><strong>${b.today.length}</strong></div><div class="v044-radar-card" data-v044-bucket="d3"><small>3일 이내</small><strong>${b.d3.length}</strong></div><div class="v044-radar-card" data-v044-bucket="d7"><small>7일 이내</small><strong>${b.d7.length}</strong></div></div>`;
      right.prepend(rp);right.prepend(hp);
    }

    dash.querySelectorAll('[data-v044-fid]').forEach(el=>el.onclick=()=>openFacility(el.dataset.v044Fid));
    dash.querySelectorAll('[data-v044-priority]').forEach(el=>el.onclick=()=>{const x=prio[Number(el.dataset.v044Priority)];if(!x)return;if(x.fid)openFacility(x.fid);else if(x.view)go(x.view)});
    dash.querySelector('[data-v044-action="health"]')?.addEventListener('click',()=>{go('facilities');setTimeout(enhanceFacilities,0)});
    dash.querySelector('[data-v044-action="priority"]')?.addEventListener('click',()=>dash.querySelector('[data-v044-panel="priority"]')?.scrollIntoView({behavior:'smooth',block:'center'}));
    dash.querySelector('[data-v044-action="repeat"]')?.addEventListener('click',()=>{const first=hs.rows.find(x=>x.h.repeat>=2);if(first)openFacility(first.f.id);else openPalette('반복 고장')});
    dash.querySelector('[data-v044-action="inspection"]')?.addEventListener('click',()=>dash.querySelector('[data-v044-panel="radar"]')?.scrollIntoView({behavior:'smooth',block:'center'}));
    dash.querySelector('[data-v044-bucket="overdue"]')?.addEventListener('click',showOverdue);
    ['today','d3','d7'].forEach(k=>dash.querySelector(`[data-v044-bucket="${k}"]`)?.addEventListener('click',()=>{const first=b[k][0];if(first)openFacility(first.id);else go('facilities')}));
  }

  function enhanceFacilities(){
    const view=document.getElementById('view-facilities');if(!view||!view.classList.contains('active'))return;
    const detail=view.querySelector('.detail-metrics');
    if(detail){
      let fid=null;try{fid=currentFacilityId}catch(_){};const f=facility(fid);if(f&&!detail.querySelector('[data-v044-detail-health]')){const h=health(f);detail.classList.add('v044-five');const m=document.createElement('div');m.className='detail-metric v044-detail-health';m.dataset.v044DetailHealth='1';m.innerHTML=`<small>시설 건강도</small><strong class="${h.tone}">${h.score} · ${h.label}</strong>`;detail.prepend(m);if(h.repeat>=2&&!view.querySelector('.v044-repeat-banner')){const banner=document.createElement('div');banner.className='v044-repeat-banner';banner.innerHTML=`<b>↻ 반복 고장 감지</b> · 최근 90일 동안 ${h.repeat}건의 고장·민원이 기록되었습니다. 원인 분석 또는 예방정비 검토가 필요합니다.`;detail.insertAdjacentElement('beforebegin',banner)}}return;
    }
    const table=view.querySelector('#facilityTable .data-table');if(!table)return;
    const head=table.querySelector('thead tr');if(head&&!head.querySelector('[data-v044-health-head]')){const th=document.createElement('th');th.dataset.v044HealthHead='1';th.textContent='건강도';head.insertBefore(th,head.lastElementChild)}
    table.querySelectorAll('tbody tr[data-open-facility]').forEach(row=>{if(row.querySelector('[data-v044-health-cell]'))return;const f=facility(row.dataset.openFacility);if(!f)return;const h=health(f);const td=document.createElement('td');td.dataset.v044HealthCell='1';td.innerHTML=`<span class="v044-health-badge ${h.tone}" title="${esc44(h.reasons.join(' · ')||'특이사항 없음')}">${h.score} ${h.label}</span>${h.repeat>=2?`<span class="v044-repeat">↻ ${h.repeat}</span>`:''}`;row.dataset.health=String(h.score);row.insertBefore(td,row.lastElementChild)});
  }

  function paletteData(q){
    const text=String(q||'').trim().toLowerCase();const out=[];
    const commands=[
      {group:'빠른 작업',icon:'＋',title:'시설 등록',sub:'새 시설을 등록합니다.',kind:'command',cmd:'facility'},
      {group:'빠른 작업',icon:'✓',title:'점검 등록',sub:'시설 점검 기록을 추가합니다.',kind:'command',cmd:'inspection'},
      {group:'빠른 작업',icon:'!',title:'고장·민원 접수',sub:'새 이슈를 등록합니다.',kind:'command',cmd:'issue'},
      {group:'빠른 작업',icon:'◷',title:'작업 일정 추가',sub:'새 작업 일정을 등록합니다.',kind:'command',cmd:'schedule'}
    ];
    commands.filter(x=>!text||`${x.title} ${x.sub}`.toLowerCase().includes(text)).forEach(x=>out.push(x));
    const data=st();
    data.facilities.forEach(f=>{const h=health(f);const hay=[f.name,f.location,f.category,f.vendor,h.label,'건강도',h.reasons.join(' ')].join(' ').toLowerCase();if(text&&hay.includes(text))out.push({group:'시설',icon:'F',title:f.name,sub:`${f.location||'-'} · ${f.category||'-'} · 건강도 ${h.score}`,kind:'facility',id:f.id})});
    data.issues.forEach(x=>{const hay=[x.title,x.note,facilityName(x.facilityId),x.status,x.severity].join(' ').toLowerCase();if(text&&hay.includes(text))out.push({group:'고장·민원',icon:'!',title:x.title||'고장·민원',sub:`${facilityName(x.facilityId)} · ${x.status||'-'}`,kind:'issue',id:x.id})});
    data.inspections.forEach(x=>{const hay=[x.inspector,x.note,facilityName(x.facilityId),x.result,x.date].join(' ').toLowerCase();if(text&&hay.includes(text))out.push({group:'점검',icon:'✓',title:`${facilityName(x.facilityId)} 점검`,sub:`${x.date||'-'} · ${x.inspector||'-'} · ${x.result||'-'}`,kind:'inspection',id:x.id})});
    data.schedules.forEach(x=>{const hay=[x.title,x.type,x.note,facilityName(x.facilityId),x.date].join(' ').toLowerCase();if(text&&hay.includes(text))out.push({group:'작업 일정',icon:'◷',title:x.title||'작업 일정',sub:`${x.date||'-'} · ${facilityName(x.facilityId)}`,kind:'schedule',id:x.id})});
    return out.slice(0,40);
  }

  function ensurePalette(){
    let root=document.getElementById('facilityOpsPalette044');if(root)return root;
    root=document.createElement('div');root.id='facilityOpsPalette044';root.className='v044-palette';root.hidden=true;root.innerHTML=`<div class="v044-palette-card" role="dialog" aria-modal="true" aria-label="FACILITY OPS 통합 검색"><div class="v044-palette-input"><span>⌕</span><input id="v044PaletteInput" autocomplete="off" placeholder="시설, 위치, 점검자, 민원, 업체, 작업명 검색..."/><kbd>ESC</kbd></div><div class="v044-results" id="v044PaletteResults"></div></div>`;document.body.appendChild(root);
    const input=root.querySelector('#v044PaletteInput');input.addEventListener('input',()=>renderPalette(input.value));input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();paletteIndex=Math.min(paletteIndex+1,paletteItems.length-1);paintPaletteSelection()}else if(e.key==='ArrowUp'){e.preventDefault();paletteIndex=Math.max(0,paletteIndex-1);paintPaletteSelection()}else if(e.key==='Enter'){e.preventDefault();activatePalette(paletteItems[paletteIndex])}else if(e.key==='Escape'){closePalette()}});root.addEventListener('mousedown',e=>{if(e.target===root)closePalette()});return root;
  }
  function renderPalette(q=''){const root=ensurePalette(),box=root.querySelector('#v044PaletteResults');paletteItems=paletteData(q);paletteIndex=0;if(!paletteItems.length){box.innerHTML='<div class="v044-no-result">검색 결과가 없습니다.</div>';return}let group='';box.innerHTML=paletteItems.map((x,i)=>{const h=x.group!==group?`<div class="v044-result-group">${esc44(x.group)}</div>`:'';group=x.group;return `${h}<button class="v044-result ${i===0?'active':''}" data-v044-result="${i}"><span class="v044-result-icon">${esc44(x.icon)}</span><span><strong>${esc44(x.title)}</strong><small>${esc44(x.sub)}</small></span><em>${x.kind==='command'?'실행':'열기'}</em></button>`}).join('');box.querySelectorAll('[data-v044-result]').forEach(btn=>{btn.onmouseenter=()=>{paletteIndex=Number(btn.dataset.v044Result);paintPaletteSelection()};btn.onclick=()=>activatePalette(paletteItems[Number(btn.dataset.v044Result)])})}
  function paintPaletteSelection(){const box=document.getElementById('v044PaletteResults');box?.querySelectorAll('[data-v044-result]').forEach((x,i)=>x.classList.toggle('active',i===paletteIndex));box?.querySelector(`[data-v044-result="${paletteIndex}"]`)?.scrollIntoView({block:'nearest'})}
  function activatePalette(x){if(!x)return;closePalette();if(x.kind==='command'){try{if(typeof openModal==='function')openModal(x.cmd)}catch(_){}}else if(x.kind==='facility')openFacility(x.id);else if(x.kind==='issue')go('issues');else if(x.kind==='inspection')go('inspections');else if(x.kind==='schedule')go('schedule')}
  function openPalette(q=''){const root=ensurePalette();root.hidden=false;const input=root.querySelector('#v044PaletteInput');input.value=q;renderPalette(q);setTimeout(()=>{input.focus();input.select()},20)}
  function closePalette(){const root=document.getElementById('facilityOpsPalette044');if(root)root.hidden=true}

  function mountSearchButton(){
    const actions=document.querySelector('.top-actions');if(!actions||document.getElementById('facilityOpsSearch044'))return;const b=document.createElement('button');b.id='facilityOpsSearch044';b.type='button';b.className='v044-search-trigger';b.innerHTML='<span>⌕ 통합검색</span><kbd>Ctrl K</kbd>';b.onclick=()=>openPalette();actions.prepend(b);
  }

  function queueMount(){if(mountQueued)return;mountQueued=true;requestAnimationFrame(()=>{mountQueued=false;mountSearchButton();if(document.getElementById('view-dashboard')?.classList.contains('active'))mountDashboard();if(document.getElementById('view-facilities')?.classList.contains('active'))enhanceFacilities()})}

  function wrapViews(){
    try{
      const oldRV=window.renderView||renderView;if(oldRV&&!oldRV.__smartOps044){const w=function(v){const r=oldRV(v);setTimeout(()=>{if(v==='dashboard')mountDashboard();if(v==='facilities')enhanceFacilities();mountSearchButton()},0);return r};w.__smartOps044=true;renderView=w;window.renderView=w}
      const oldRF=window.renderFacilities||renderFacilities;if(oldRF&&!oldRF.__smartOps044){const wf=function(){const r=oldRF.apply(this,arguments);setTimeout(enhanceFacilities,0);return r};wf.__smartOps044=true;renderFacilities=wf;window.renderFacilities=wf}
      const oldRD=window.renderDashboard||renderDashboard;if(oldRD&&!oldRD.__smartOps044){const wd=function(){const r=oldRD.apply(this,arguments);setTimeout(mountDashboard,0);return r};wd.__smartOps044=true;renderDashboard=wd;window.renderDashboard=wd}
    }catch(err){console.warn('[FACILITY OPS v0.4.4 wrap]',err)}
  }

  injectStyle();ensurePalette();wrapViews();mountSearchButton();queueMount();
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();const root=document.getElementById('facilityOpsPalette044');root&&!root.hidden?closePalette():openPalette()}else if(e.key==='Escape'&&!document.getElementById('facilityOpsPalette044')?.hidden)closePalette()},true);
  const observer=new MutationObserver(muts=>{if(muts.some(m=>m.type==='childList'&&m.addedNodes.length))queueMount()});observer.observe(document.body,{childList:true,subtree:true});
  window.FACILITY_OPS_SMART_OPS={version:VERSION,healthScore:id=>health(facility(id)),openPalette,rollbackBase:'ead0e5909873b12d6e7fabeb09d1a7b09d708e6b'};
})();
