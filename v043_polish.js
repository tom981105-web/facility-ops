// FACILITY OPS v0.4.3 — FULL INTERFACE POLISH
// Visual-only finishing layer. Does not replace CRUD/auth/permission functions.
(function(){
  const STYLE_ID='facilityOpsFullPolish043';
  let queued=false;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
/* ------------------------------------------------------------------
   FACILITY OPS v0.4.3 — full control-center visual language
   ------------------------------------------------------------------ */
:root{--ops43-blue:#2587f8;--ops43-blue2:#61b2ff;--ops43-green:#28b978;--ops43-gold:#d99a24;--ops43-red:#e6535a;--ops43-purple:#7864de}

/* page rhythm */
.view:not(#view-dashboard){max-width:1560px;margin:0 auto}
.view:not(#view-dashboard)>.section-head{margin:0 0 13px!important;padding:0 2px 13px;border-bottom:1px solid var(--line)}
.view:not(#view-dashboard)>.section-head>div:first-child{position:relative;padding-top:16px}
.view:not(#view-dashboard)>.section-head>div:first-child:before{display:block;margin-bottom:7px;font-size:8px;line-height:1;font-weight:800;letter-spacing:.18em;color:var(--muted)}
#view-facilities>.section-head>div:first-child:before{content:'FACILITY INVENTORY'}
#view-inspections>.section-head>div:first-child:before{content:'INSPECTION CONTROL'}
#view-issues>.section-head>div:first-child:before{content:'ISSUE & SERVICE DESK'}
#view-schedule>.section-head>div:first-child:before{content:'WORK SCHEDULER'}
.view:not(#view-dashboard)>.section-head h2{font-size:20px!important;font-weight:850;letter-spacing:-.035em}
.view:not(#view-dashboard)>.section-head p{max-width:760px;font-size:11px!important;line-height:1.55}
.count-pill{min-width:54px;text-align:center;background:var(--panel-2);border-color:var(--line)!important;font-weight:800;color:var(--soft)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}

/* internal panels */
.view:not(#view-dashboard) .panel{border-radius:12px!important;background:linear-gradient(150deg,var(--panel),color-mix(in srgb,var(--panel-2) 68%,var(--panel)))!important;border-color:var(--line)!important;box-shadow:0 12px 34px rgba(0,0,0,.13)!important}
.view:not(#view-dashboard) .panel-title{padding-bottom:12px;margin-bottom:13px!important;border-bottom:1px solid var(--line)}
.view:not(#view-dashboard) .panel-title h3{font-size:14px!important;font-weight:800;letter-spacing:-.02em}
.view:not(#view-dashboard) .panel-title small{font-size:9px!important;letter-spacing:.03em}

/* toolbars / filters */
.table-toolbar{padding:11px 12px;margin:0 0 10px!important;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--panel-2) 78%,transparent)}
.toolbar-cluster{gap:7px!important}
.searchbox{min-height:38px;border-radius:9px!important;background:var(--panel)!important;border-color:var(--line)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.02)}
.searchbox:focus-within{border-color:color-mix(in srgb,var(--accent) 48%,var(--line))!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 8%,transparent)}
.filter-btn,.filter-select{min-height:34px;border-radius:8px!important;background:var(--panel)!important;border-color:var(--line)!important;transition:.15s ease}
.filter-btn:hover,.filter-select:hover{border-color:var(--line-strong)!important;color:var(--text)!important}
.filter-btn.active{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent)}

/* operations tables */
.view:not(#view-dashboard) .data-table{border:1px solid var(--line);border-radius:11px!important;background:var(--panel);overflow:hidden}
.view:not(#view-dashboard) .data-table thead{background:color-mix(in srgb,var(--panel-2) 90%,var(--panel))}
.view:not(#view-dashboard) .data-table th{height:40px;padding:0 13px!important;font-size:9px!important;font-weight:800!important;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)!important;border-bottom:1px solid var(--line)!important;white-space:nowrap}
.view:not(#view-dashboard) .data-table td{padding:13px!important;font-size:11px!important;border-bottom-color:color-mix(in srgb,var(--line) 78%,transparent)!important}
.view:not(#view-dashboard) .data-table tbody tr{background:transparent;transition:background .14s ease,transform .14s ease}
.view:not(#view-dashboard) .data-table tbody tr:nth-child(even){background:color-mix(in srgb,var(--panel-2) 28%,transparent)}
.view:not(#view-dashboard) .data-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 6%,var(--panel-2))!important}
.view:not(#view-dashboard) .name-cell strong{font-size:12px!important;font-weight:760}.view:not(#view-dashboard) .name-cell small{font-size:9px!important}
.status-badge,.tag,.due-badge{border-radius:7px!important;font-weight:750!important}
.mini-btn{height:30px!important;border-radius:7px!important;background:var(--panel-2)!important}
.mini-btn:hover{background:var(--panel-3)!important;transform:translateY(-1px)}

/* facilities detail */
.detail-shell{gap:11px!important}
.back-link{height:32px;padding:0 10px!important;margin:0 0 2px!important;border:1px solid var(--line)!important;border-radius:8px!important;background:var(--panel-2)!important;font-weight:700}
.detail-hero{border-radius:14px!important;padding:20px!important;background:linear-gradient(135deg,var(--panel),color-mix(in srgb,var(--accent) 3%,var(--panel-2)))!important;box-shadow:0 14px 36px rgba(0,0,0,.15)!important}
.detail-hero:before{content:'ASSET PROFILE';display:block;margin:0 0 13px;font-size:8px;font-weight:800;letter-spacing:.2em;color:var(--muted);position:relative;z-index:2}
.detail-hero:after{width:340px!important;height:340px!important;right:-145px!important;top:-190px!important;opacity:.045!important}
.detail-code{border-radius:10px!important;width:46px!important;height:46px!important;background:color-mix(in srgb,var(--accent) 8%,var(--panel-2))!important;border-color:color-mix(in srgb,var(--accent) 20%,var(--line))!important;font-size:16px!important}
.detail-head h2{font-size:25px!important;font-weight:860!important}
.detail-sub{gap:8px!important;font-size:10px!important}
.detail-metrics{gap:8px!important;margin-top:16px!important}
.detail-metric{min-height:74px;padding:13px 14px!important;border-radius:10px!important;background:color-mix(in srgb,var(--panel-2) 72%,transparent)!important}
.detail-metric small{font-size:9px!important;text-transform:uppercase;letter-spacing:.06em}.detail-metric strong{font-size:15px!important}
.detail-grid{gap:11px!important}.detail-grid>.panel{min-height:100%}
.info-row{grid-template-columns:105px 1fr!important;padding:12px 2px!important}.info-row span{font-size:9px!important;text-transform:uppercase;letter-spacing:.04em}.info-row strong{font-size:12px!important;color:var(--text)!important}
.quick-actions{gap:7px!important}.quick-action{min-height:64px!important;border-radius:9px!important;background:var(--panel)!important;position:relative;overflow:hidden}.quick-action:after{content:'›';position:absolute;right:10px;top:9px;color:var(--muted);font-size:18px}.quick-action:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(0,0,0,.10)}
.timeline-item{padding:14px 2px!important}.timeline-icon{border-radius:8px!important;background:var(--panel)!important}.timeline-main strong{font-size:12px!important}.timeline-main small{font-size:10px!important}

/* schedule */
.schedule-layout{gap:11px!important}
.schedule-layout>.panel:first-child{overflow:visible!important}
.month-nav .icon-btn{width:34px!important;height:34px!important;min-height:34px!important}.month-title{font-size:13px!important;font-weight:800!important}
.calendar{gap:4px!important}.cal-head{font-size:9px!important;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.cal-day{min-height:96px!important;border-radius:8px!important;background:color-mix(in srgb,var(--panel-2) 62%,var(--panel))!important;transition:.14s ease}.cal-day:hover{border-color:var(--line-strong)!important;background:var(--panel-2)!important}.cal-day.today{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 22%,transparent),0 0 0 2px color-mix(in srgb,var(--accent) 5%,transparent)!important}.cal-num{font-weight:800!important}.cal-event{border-radius:5px!important;padding:5px 6px!important;background:var(--panel-3)!important;font-size:8px!important}

/* modal system */
.modal-backdrop{background:rgba(2,8,14,.78)!important;backdrop-filter:blur(12px)!important}
.modal{width:min(760px,96vw)!important;border-radius:14px!important;background:linear-gradient(150deg,var(--panel),var(--panel-2))!important;border-color:var(--line-strong)!important;box-shadow:0 32px 110px rgba(0,0,0,.52)!important}
.modal-head{padding:18px 20px 15px!important;background:color-mix(in srgb,var(--panel-2) 62%,transparent)}
.modal-head .eyebrow{font-size:8px!important}.modal-head h2{font-size:20px!important;font-weight:850!important}
.modal-body{padding:20px!important;gap:15px 13px!important}.modal-foot{padding:14px 20px!important;background:color-mix(in srgb,var(--panel-2) 62%,transparent)}
.field{gap:7px!important}.field label{font-size:9px!important;font-weight:750!important;letter-spacing:.065em;text-transform:uppercase}.field input,.field select,.field textarea{border-radius:8px!important;background:var(--panel)!important;border-color:var(--line)!important;font-size:12px!important;transition:border .14s ease,box-shadow .14s ease}.field input:focus,.field select:focus,.field textarea:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 8%,transparent)}

/* admin center / users / audit / trash */
.v04-admin-overlay{background:rgba(2,8,14,.82)!important;backdrop-filter:blur(13px)!important}
.v04-admin-shell{width:min(1240px,96vw)!important;height:min(820px,93vh)!important;border-radius:15px!important;background:linear-gradient(150deg,var(--panel),var(--panel-2))!important;box-shadow:0 38px 120px rgba(0,0,0,.55)!important}
.v04-admin-head{padding:18px 21px!important;background:color-mix(in srgb,var(--panel-2) 54%,transparent)}.v04-admin-head h2{font-size:21px!important;font-weight:850!important}.v04-admin-head p{font-size:10px!important}
.v04-admin-tabs{padding:9px 20px!important;gap:6px!important;background:color-mix(in srgb,var(--panel-2) 74%,var(--panel))!important}.v04-tab{border-radius:7px!important;padding:8px 13px!important;background:var(--panel)!important;font-size:10px!important}.v04-tab.active{box-shadow:inset 0 -2px 0 var(--accent)!important}
.v04-admin-content{padding:17px 20px 22px!important}.v04-toolbar{padding-bottom:12px;border-bottom:1px solid var(--line)}.v04-toolbar h3{font-size:16px!important;font-weight:820!important}
.v04-table-wrap{border-radius:10px!important;background:var(--panel)!important}.v04-table thead{background:var(--panel-2)}.v04-table th{height:39px;padding:0 12px!important;font-size:9px!important;text-transform:uppercase;letter-spacing:.07em}.v04-table td{padding:11px 12px!important;font-size:11px!important}.v04-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 5%,var(--panel-2))}
.v04-input,.v04-select{border-radius:7px!important;background:var(--panel-2)!important}.v04-pill,.v04-owner-note{border-radius:6px!important}.v04-log-list{gap:6px!important}.v04-log{border-radius:8px!important;background:var(--panel)!important;padding:11px 12px!important}.v04-empty{border-radius:9px!important;background:color-mix(in srgb,var(--panel-2) 52%,transparent)}

/* common buttons / empties */
.primary-btn{border-radius:8px!important}.ghost-btn,.icon-btn{border-radius:8px!important}.empty{border-radius:9px!important;background:color-mix(in srgb,var(--panel-2) 42%,transparent);min-height:92px;display:grid;place-items:center}
.toast{border-radius:8px!important}

/* light mode complete pass */
body.light .view:not(#view-dashboard) .panel,body.light .detail-hero,body.light .modal,body.light .v04-admin-shell{background:linear-gradient(150deg,#fff,#f8fafc)!important;border-color:rgba(35,55,78,.10)!important;box-shadow:0 12px 32px rgba(40,58,78,.07)!important}
body.light .table-toolbar,body.light .detail-metric,body.light .cal-day,body.light .v04-admin-tabs,body.light .v04-admin-head,body.light .modal-head,body.light .modal-foot{background:#f7fafc!important}
body.light .searchbox,body.light .filter-btn,body.light .filter-select,body.light .quick-action,body.light .field input,body.light .field select,body.light .field textarea,body.light .v04-table-wrap,body.light .v04-log,body.light .v04-tab{background:#fff!important}
body.light .view:not(#view-dashboard) .data-table{background:#fff!important}.body.light .view:not(#view-dashboard) .data-table thead{background:#f7fafc!important}
body.light .view:not(#view-dashboard) .data-table tbody tr:nth-child(even){background:#fbfcfe!important}
body.light .view:not(#view-dashboard) .data-table tbody tr:hover,body.light .v04-table tbody tr:hover{background:#f1f7fd!important}
body.light .modal-backdrop,body.light .v04-admin-overlay{background:rgba(222,231,240,.76)!important}

@media(max-width:1100px){.detail-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}.v04-admin-shell{width:97vw!important}}
@media(max-width:760px){.view:not(#view-dashboard)>.section-head{align-items:flex-start!important}.table-toolbar{padding:9px!important}.detail-hero{padding:15px!important}.detail-metrics{grid-template-columns:1fr 1fr!important}.modal-body{padding:15px!important}.v04-admin-content{padding:12px!important}.v04-admin-head{padding:15px!important}.v04-admin-tabs{padding:8px 12px!important}}
`;
    document.head.appendChild(s);
  }

  function tagViews(){
    const labels={
      'view-facilities':'시설 자산 목록',
      'view-inspections':'점검 운영 목록',
      'view-issues':'고장·민원 처리 목록',
      'view-schedule':'작업 일정'
    };
    Object.entries(labels).forEach(([id,label])=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.dataset.opsPolish='043';
      el.setAttribute('aria-label',label);
    });
  }

  function polishDynamic(){
    queued=false;
    ensureStyle();
    tagViews();
    document.querySelectorAll('.data-table').forEach(t=>t.setAttribute('data-ops-table','043'));
    document.querySelectorAll('.modal').forEach(m=>m.setAttribute('data-ops-modal','043'));
    document.querySelectorAll('.detail-hero').forEach(d=>d.setAttribute('data-ops-detail','043'));
    const admin=document.querySelector('.v04-admin-shell');
    if(admin) admin.setAttribute('data-ops-admin','043');
    document.documentElement.dataset.facilityPolish='043-full';
  }

  function queue(){if(queued)return;queued=true;requestAnimationFrame(polishDynamic)}
  polishDynamic();
  document.addEventListener('DOMContentLoaded',polishDynamic,{once:true});
  window.addEventListener('load',polishDynamic,{once:true});
  const start=()=>{const o=new MutationObserver(queue);o.observe(document.body,{childList:true,subtree:true});};
  if(document.body) start(); else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
