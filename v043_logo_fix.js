// FACILITY OPS v0.4.3 — LOGO + LIGHT THEME HOTFIX
(function(){
  const STYLE_ID='facilityOpsLogoThemeHotfix043';

  function ensureThemeStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* v0.4.3 light-theme completion */
      body.light{background:radial-gradient(circle at 84% 8%,rgba(39,111,191,.07),transparent 28%),radial-gradient(circle at 12% 90%,rgba(22,125,105,.05),transparent 32%),#f3f6fa!important;color:#142234!important}
      body.light .sidebar{background:linear-gradient(180deg,rgba(255,255,255,.99),rgba(247,250,253,.99))!important;border-right-color:rgba(35,55,78,.10)!important}
      body.light .topbar{background:rgba(255,255,255,.88)!important;border-bottom-color:rgba(35,55,78,.10)!important;box-shadow:0 8px 24px rgba(41,57,71,.04)}
      body.light .status-card,
      body.light .panel,
      body.light .metric-card,
      body.light .ops43-panel{background:linear-gradient(145deg,#ffffff,#f8fafc)!important;border-color:rgba(35,55,78,.10)!important;box-shadow:0 10px 28px rgba(41,57,71,.07)!important}
      body.light .auth-gate{background:radial-gradient(circle at 50% 12%,rgba(39,111,191,.10),transparent 34%),#eef3f8!important}
      body.light .auth-card{background:linear-gradient(145deg,#ffffff,#f7fafc)!important;border-color:rgba(35,55,78,.14)!important;box-shadow:0 28px 90px rgba(41,57,71,.14)!important}
      body.light .online-pill,
      body.light .user-chip,
      body.light .ghost-btn,
      body.light .icon-btn,
      body.light .searchbox,
      body.light .filter-btn,
      body.light .tag,
      body.light .mini-btn,
      body.light .ops43-alert,
      body.light .ops43-system-card,
      body.light .ops43-type{background:#f8fafc!important;border-color:rgba(35,55,78,.10)!important;color:var(--soft)!important}
      body.light .nav-item span{background:#eef3f8!important;color:#52657a!important}
      body.light .nav-item:hover{background:#f4f7fa!important;color:var(--text)!important}
      body.light .nav-item.active{background:linear-gradient(90deg,rgba(39,111,191,.14),rgba(39,111,191,.04))!important;border-color:rgba(39,111,191,.20)!important;color:#17385c!important;box-shadow:inset 3px 0 0 #276fbf!important}
      body.light .nav-item.active span{background:rgba(39,111,191,.10)!important;color:#276fbf!important}
      body.light .system-pill{background:#f8fafc!important;border-color:rgba(35,55,78,.10)!important}
      body.light .data-table tbody tr:hover,
      body.light .ops43-table tbody tr:hover{background:rgba(39,111,191,.045)!important}
      body.light input,
      body.light select,
      body.light textarea{color:var(--text)!important}
      body.light .modal-card,
      body.light .detail-hero,
      body.light .detail-metric,
      body.light .timeline-card,
      body.light .calendar,
      body.light .calendar-head,
      body.light .cal-day{background:var(--panel)!important;color:var(--text)!important;border-color:var(--line)!important}
      body.light .toast{background:#ffffff!important;color:#142234!important;border-color:rgba(35,55,78,.12)!important;box-shadow:0 12px 32px rgba(41,57,71,.12)!important}

      /* logo visibility */
      .facility-brand-logo{display:block!important;visibility:visible!important;opacity:1!important;object-fit:contain!important;flex:0 0 auto!important}
      .brand .facility-brand-logo{width:64px!important;height:50px!important;max-width:64px!important}
      .auth-logo .facility-brand-logo{width:82px!important;height:60px!important;max-width:82px!important}
      .brand-mark:has(+ .facility-brand-logo),
      .brand .brand-mark,
      .auth-logo .brand-mark{display:none!important}
    `;
    document.head.appendChild(s);
  }

  function repairLogo(){
    // v043_ui.js가 먼저 삽입한 정상 로고의 src는 절대로 덮어쓰지 않는다.
    const all=[...document.querySelectorAll('.facility-brand-logo')];
    all.forEach(img=>{
      img.hidden=false;
      img.removeAttribute('aria-hidden');
      img.style.display='block';
      img.style.visibility='visible';
      img.style.opacity='1';
      if(!img.alt) img.alt='FACILITY OPS';
    });

    // 한쪽에만 로고가 생긴 경우 같은 정상 이미지를 복제한다.
    const source=all.find(img=>String(img.getAttribute('src')||'').startsWith('data:image/')) || all[0];
    document.querySelectorAll('.brand,.auth-logo').forEach(root=>{
      let img=root.querySelector('.facility-brand-logo');
      if(!img && source){
        img=source.cloneNode(true);
        img.className='facility-brand-logo';
        img.alt='FACILITY OPS';
        root.prepend(img);
      }
      const mark=root.querySelector('.brand-mark');
      if(mark && img) mark.style.display='none';
    });
  }

  let queued=false;
  function apply(){
    queued=false;
    ensureThemeStyle();
    repairLogo();
    document.documentElement.dataset.facilityLogoThemeHotfix='043';
  }
  function queue(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(apply);
  }

  apply();
  window.addEventListener('DOMContentLoaded',()=>{
    apply();
    const observer=new MutationObserver(queue);
    observer.observe(document.body,{childList:true,subtree:true});
  },{once:true});
})();
