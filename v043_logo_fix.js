// FACILITY OPS v0.4.3 — FINAL LOGO + LIGHT THEME FIX
(function(){
  const STYLE_ID='facilityOpsLogoThemeFinal043';
  let queued=false;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      body.light{background:radial-gradient(circle at 84% 8%,rgba(39,111,191,.07),transparent 28%),radial-gradient(circle at 12% 90%,rgba(22,125,105,.05),transparent 32%),#f3f6fa!important;color:#142234!important}
      body.light .sidebar{background:linear-gradient(180deg,rgba(255,255,255,.99),rgba(247,250,253,.99))!important;border-right-color:rgba(35,55,78,.10)!important}
      body.light .topbar{background:rgba(255,255,255,.88)!important;border-bottom-color:rgba(35,55,78,.10)!important;box-shadow:0 8px 24px rgba(41,57,71,.04)}
      body.light .status-card,body.light .panel,body.light .metric-card,body.light .ops43-panel{background:linear-gradient(145deg,#fff,#f8fafc)!important;border-color:rgba(35,55,78,.10)!important;box-shadow:0 10px 28px rgba(41,57,71,.07)!important}
      body.light .auth-gate{background:radial-gradient(circle at 50% 12%,rgba(39,111,191,.10),transparent 34%),#eef3f8!important}
      body.light .auth-card{background:linear-gradient(145deg,#fff,#f7fafc)!important;border-color:rgba(35,55,78,.14)!important;box-shadow:0 28px 90px rgba(41,57,71,.14)!important}
      body.light .online-pill,body.light .user-chip,body.light .ghost-btn,body.light .icon-btn,body.light .searchbox,body.light .filter-btn,body.light .tag,body.light .mini-btn,body.light .ops43-alert,body.light .ops43-system-card,body.light .ops43-type{background:#f8fafc!important;border-color:rgba(35,55,78,.10)!important;color:var(--soft)!important}
      body.light .nav-item span{background:#eef3f8!important;color:#52657a!important}
      body.light .nav-item:hover{background:#f4f7fa!important;color:var(--text)!important}
      body.light .nav-item.active{background:linear-gradient(90deg,rgba(39,111,191,.14),rgba(39,111,191,.04))!important;border-color:rgba(39,111,191,.20)!important;color:#17385c!important;box-shadow:inset 3px 0 0 #276fbf!important}
      body.light .nav-item.active span{background:rgba(39,111,191,.10)!important;color:#276fbf!important}
      body.light .system-pill{background:#f8fafc!important;border-color:rgba(35,55,78,.10)!important}
      body.light .data-table tbody tr:hover,body.light .ops43-table tbody tr:hover{background:rgba(39,111,191,.045)!important}
      body.light input,body.light select,body.light textarea{color:var(--text)!important}
      body.light .modal-card,body.light .detail-hero,body.light .detail-metric,body.light .timeline-card,body.light .calendar,body.light .calendar-head,body.light .cal-day{background:var(--panel)!important;color:var(--text)!important;border-color:var(--line)!important}
      body.light .toast{background:#fff!important;color:#142234!important;border-color:rgba(35,55,78,.12)!important;box-shadow:0 12px 32px rgba(41,57,71,.12)!important}

      .facility-brand-logo-final{display:block!important;visibility:visible!important;opacity:1!important;object-fit:contain!important;object-position:center!important;flex:0 0 auto!important;transform:none!important;filter:none!important;background:transparent!important}
      .sidebar .brand>.facility-brand-logo-final,.brand>.facility-brand-logo-final{width:72px!important;height:48px!important;max-width:72px!important;min-width:72px!important;margin:0 2px 0 0!important}
      .auth-logo>.facility-brand-logo-final,.auth-card>.facility-brand-logo-final{width:112px!important;height:74px!important;max-width:112px!important;margin:0 auto 12px!important}
      .brand>.brand-mark,.auth-logo>.brand-mark{display:none!important}
    `;
    document.head.appendChild(s);
  }

  function logo(){
    const value=window.FACILITY_OPS_LOGO;
    return typeof value==='string' && value.startsWith('data:image/') ? value : '';
  }

  function makeImg(kind){
    const img=document.createElement('img');
    img.className='facility-brand-logo-final';
    img.alt='FACILITY OPS';
    img.loading='eager';
    img.decoding='sync';
    img.dataset.logoKind=kind;
    img.src=logo();
    return img;
  }

  function mountBrand(root){
    const src=logo();
    if(!root||!src) return;
    root.querySelectorAll(':scope > .facility-brand-logo,.facility-brand-logo-final').forEach((el,i)=>{if(i>0)el.remove();});
    let img=root.querySelector(':scope > .facility-brand-logo-final');
    if(!img){img=makeImg('brand');root.prepend(img);}else if(img.getAttribute('src')!==src){img.src=src;}
    const mark=root.querySelector(':scope > .brand-mark');
    if(mark) mark.style.display='none';
  }

  function mountAuth(){
    const src=logo();
    if(!src) return;
    const root=document.querySelector('.auth-logo')||document.querySelector('.auth-card');
    if(!root) return;
    let img=root.querySelector(':scope > .facility-brand-logo-final');
    if(!img){img=makeImg('auth');root.prepend(img);}else if(img.getAttribute('src')!==src){img.src=src;}
    const mark=root.querySelector(':scope > .brand-mark');
    if(mark) mark.style.display='none';
  }

  function apply(){
    queued=false;
    ensureStyle();
    if(!logo()) return;
    document.querySelectorAll('.brand').forEach(mountBrand);
    mountAuth();
    document.documentElement.dataset.facilityLogo='mounted-final';
  }

  function queue(){if(queued)return;queued=true;requestAnimationFrame(apply);}
  apply();
  document.addEventListener('DOMContentLoaded',apply,{once:true});
  window.addEventListener('load',apply,{once:true});
  const startObserver=()=>{const o=new MutationObserver(queue);o.observe(document.body,{childList:true,subtree:true});};
  if(document.body) startObserver(); else document.addEventListener('DOMContentLoaded',startObserver,{once:true});
})();
