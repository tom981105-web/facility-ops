// FACILITY OPS v0.4.3 — BRAND ALIGN + LIGHT THEME FIX
(function(){
  const STYLE_ID='facilityOpsLogoThemeFinal043';

  function ensureStyle(){
    let s=document.getElementById(STYLE_ID);
    if(!s){s=document.createElement('style');s.id=STYLE_ID;document.head.appendChild(s)}
    s.textContent=`
      /* LIGHT THEME COMPLETION */
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

      /* STATIC LOGO IS NOW THE SINGLE SOURCE OF TRUTH */
      .brand>.facility-brand-logo,.brand>.facility-brand-logo-final,
      .auth-logo>.facility-brand-logo,.auth-logo>.facility-brand-logo-final{display:none!important}
      .brand>.brand-mark,.auth-logo>.brand-mark{display:none!important}

      /* SIDEBAR BRAND — keep logo and full title inside 240px sidebar */
      .sidebar .brand{
        display:grid!important;
        grid-template-columns:58px minmax(0,1fr)!important;
        align-items:center!important;
        column-gap:10px!important;
        min-height:72px!important;
        padding:2px 4px 18px!important;
        margin-bottom:14px!important;
      }
      .sidebar .brand>.facility-logo-static{
        display:block!important;visibility:visible!important;opacity:1!important;
        width:58px!important;height:52px!important;min-width:58px!important;max-width:58px!important;
        margin:0!important;object-fit:contain!important;justify-self:center!important;
      }
      .sidebar .brand>div:last-child{min-width:0!important;align-self:center!important}
      .sidebar .brand strong{
        display:block!important;font-size:15px!important;line-height:1.08!important;
        letter-spacing:-.025em!important;white-space:nowrap!important;overflow:visible!important;
      }
      .sidebar .brand small{
        display:block!important;margin-top:5px!important;font-size:7px!important;line-height:1.35!important;
        letter-spacing:.09em!important;white-space:normal!important;max-width:112px!important;
      }

      /* LOGIN BRAND — logo + title behave as one centered horizontal lockup */
      .auth-card .auth-logo{
        display:grid!important;
        grid-template-columns:112px minmax(0,1fr)!important;
        align-items:center!important;
        justify-content:center!important;
        column-gap:24px!important;
        width:100%!important;
        max-width:390px!important;
        margin:0 auto 30px!important;
        padding:2px 4px!important;
      }
      .auth-card .auth-logo>.facility-logo-static{
        display:block!important;visibility:visible!important;opacity:1!important;
        width:112px!important;height:82px!important;min-width:112px!important;max-width:112px!important;
        margin:0!important;object-fit:contain!important;justify-self:end!important;
      }
      .auth-card .auth-logo>div:last-child{
        min-width:0!important;align-self:center!important;text-align:left!important;
      }
      .auth-card .auth-logo h2{
        margin:0!important;font-size:21px!important;line-height:1.05!important;
        letter-spacing:-.035em!important;white-space:nowrap!important;
      }
      .auth-card .auth-logo p{
        margin:7px 0 0!important;font-size:0!important;line-height:1.25!important;white-space:nowrap!important;
      }
      .auth-card .auth-logo p::after{
        content:'v0.4.3 · SECURE OPERATIONS'!important;
        display:block!important;font-size:9px!important;color:var(--muted)!important;letter-spacing:.01em!important;
      }

      /* Keep small screens tidy */
      @media(max-width:520px){
        .auth-card .auth-logo{grid-template-columns:86px minmax(0,1fr)!important;column-gap:16px!important;max-width:330px!important}
        .auth-card .auth-logo>.facility-logo-static{width:86px!important;height:68px!important;min-width:86px!important;max-width:86px!important}
        .auth-card .auth-logo h2{font-size:19px!important}
        .sidebar .brand{grid-template-columns:54px minmax(0,1fr)!important}
        .sidebar .brand>.facility-logo-static{width:54px!important;min-width:54px!important;max-width:54px!important}
      }
    `;
  }

  function apply(){
    ensureStyle();
    document.documentElement.dataset.facilityBrandAlign='043-final';
  }

  apply();
  document.addEventListener('DOMContentLoaded',apply,{once:true});
  window.addEventListener('load',apply,{once:true});
})();
