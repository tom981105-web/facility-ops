// FACILITY OPS v0.4.2 — SECURITY HARDENING (isolated)
// This module must not replace v0.4/v0.4.1 CRUD or role-permission functions.
(function(){
  const CFG=window.FACILITY_OPS_CONFIG||{};
  const SITE_KEY=String(CFG.turnstileSiteKey||'').trim();
  const SDK_VERSION=String(CFG.supabaseJsVersion||'2.112.4');
  const PASSWORD=Object.assign({minLength:12,requireLower:true,requireUpper:true,requireNumber:true,requireSymbol:true},CFG.passwordPolicy||{});
  let captchaToken='';
  let captchaWidgetId=null;
  let lastClient=null;
  let lastProfile=null;
  let mfaGate=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function isAdminProfile(p){return p?.approved!==false&&p?.role==='admin';}
  function qrSource(raw){const t=String(raw||'');if(t.startsWith('data:'))return t;if(t.trim().startsWith('<svg'))return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(t);return t;}

  function injectStyle(){
    if(document.getElementById('facilityOpsV042Style'))return;
    const style=document.createElement('style');
    style.id='facilityOpsV042Style';
    style.textContent=`
      .sidebar .version{font-size:0!important}.sidebar .version::after{content:"FACILITY OPS v0.4.2 SECURITY HARDENING"!important;font-size:10px!important}
      .auth-logo p{font-size:0!important}.auth-logo p::after{content:"v0.4.2 SECURITY HARDENING"!important;font-size:11px!important}
      .v042-overlay{position:fixed;inset:0;z-index:180;background:rgba(2,8,14,.86);backdrop-filter:blur(10px);display:grid;place-items:center;padding:22px}.v042-overlay[hidden]{display:none}
      .v042-card{width:min(520px,96vw);max-height:92vh;overflow:auto;border:1px solid var(--line-strong);border-radius:22px;background:linear-gradient(145deg,var(--panel),var(--panel-2));box-shadow:0 30px 100px rgba(0,0,0,.52);padding:24px}
      .v042-card h2{margin:6px 0 8px;font-size:21px}.v042-card p{color:var(--muted);font-size:11px;line-height:1.65;margin:0 0 15px}
      .v042-qr{display:grid;place-items:center;background:#fff;border-radius:14px;padding:12px;width:220px;height:220px;margin:12px auto}.v042-qr img{max-width:196px;max-height:196px}
      .v042-secret{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;border:1px solid var(--line);background:var(--panel-3);border-radius:10px;padding:10px;color:var(--soft);font-size:10px;margin:9px 0 14px}
      .v042-code{width:100%;min-height:46px;border:1px solid var(--line);border-radius:11px;background:var(--panel-2);color:var(--text);padding:0 12px;font-size:18px;letter-spacing:.18em;text-align:center;outline:none}
      .v042-actions{display:flex;gap:8px;margin-top:12px}.v042-actions>*{flex:1}.v042-error{min-height:18px;color:var(--alert);font-size:10px;margin-top:9px;text-align:center}
      .v042-sec-list{display:grid;gap:8px;margin-top:14px}.v042-sec-item{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:start;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:var(--panel-2)}.v042-sec-item b{font-size:10px}.v042-sec-item span{font-size:11px;color:var(--soft);line-height:1.5}
    `;
    document.head.appendChild(style);
  }

  function ensureMfaOverlay(){
    let root=document.getElementById('adminMfaV042');
    if(root)return root;
    root=document.createElement('div');
    root.id='adminMfaV042';root.className='v042-overlay';root.hidden=true;
    root.innerHTML=`<div class="v042-card" role="dialog" aria-modal="true" aria-label="관리자 2단계 인증">
      <div class="eyebrow">FACILITY OPS / ADMIN SECURITY</div><h2 id="v042MfaTitle">관리자 2단계 인증</h2>
      <p id="v042MfaHelp">관리자 계정은 비밀번호 인증 후 Authenticator 앱의 6자리 코드가 필요합니다.</p>
      <div id="v042EnrollBox" hidden><div class="v042-qr"><img id="v042MfaQr" alt="2FA QR 코드"></div><div class="v042-secret" id="v042MfaSecret"></div></div>
      <input class="v042-code" id="v042MfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
      <div class="v042-actions"><button class="primary-btn" type="button" id="v042MfaVerify">인증</button><button class="ghost-btn" type="button" id="v042MfaLogout">로그아웃</button></div>
      <div class="v042-error" id="v042MfaError"></div></div>`;
    document.body.appendChild(root);
    root.querySelector('#v042MfaVerify').onclick=verifyMfa;
    root.querySelector('#v042MfaCode').addEventListener('keydown',e=>{if(e.key==='Enter')verifyMfa();});
    root.querySelector('#v042MfaLogout').onclick=async()=>{const gate=mfaGate;try{await gate?.client?.auth?.signOut();}catch(_){}root.hidden=true;if(gate){mfaGate=null;gate.resolve(false);}};
    return root;
  }

  async function prepareMfa(){
    const gate=mfaGate;if(!gate||gate.busy)return;
    gate.busy=true;
    const root=ensureMfaOverlay();const errorEl=root.querySelector('#v042MfaError');
    errorEl.textContent='2FA 정보를 확인하는 중...';
    try{
      const listed=await gate.client.auth.mfa.listFactors();if(listed.error)throw listed.error;
      const factors=listed.data?.totp||[];
      const verified=factors.find(x=>x.status==='verified')||null;
      if(verified){
        gate.factor=verified;gate.enrollment=null;
        root.querySelector('#v042MfaTitle').textContent='관리자 2단계 인증';
        root.querySelector('#v042MfaHelp').textContent='Authenticator 앱에 표시되는 6자리 코드를 입력하세요.';
        root.querySelector('#v042EnrollBox').hidden=true;
      }else{
        const pending=factors.filter(x=>x.status!=='verified');
        for(const factor of pending){
          if(!factor?.id)continue;
          const removed=await gate.client.auth.mfa.unenroll({factorId:factor.id});
          if(removed.error)console.warn('[FACILITY OPS v0.4.2 MFA stale cleanup]',removed.error);
        }
        const friendly='FACILITY OPS 관리자 '+String(Date.now()).slice(-6);
        const enrolled=await gate.client.auth.mfa.enroll({factorType:'totp',friendlyName:friendly});if(enrolled.error)throw enrolled.error;
        gate.enrollment=enrolled.data;gate.factor=enrolled.data;
        root.querySelector('#v042MfaTitle').textContent='관리자 2FA 최초 등록';
        root.querySelector('#v042MfaHelp').textContent='① Authenticator 앱에서 새 QR을 스캔 → ② 앱에 표시되는 6자리 코드 입력 → ③ 인증을 누르세요.';
        root.querySelector('#v042EnrollBox').hidden=false;
        root.querySelector('#v042MfaQr').src=qrSource(enrolled.data?.totp?.qr_code||'');
        root.querySelector('#v042MfaSecret').textContent=enrolled.data?.totp?.secret?'수동 등록 키: '+enrolled.data.totp.secret:'QR 코드를 스캔해 주세요.';
      }
      errorEl.textContent='';setTimeout(()=>root.querySelector('#v042MfaCode')?.focus(),20);
    }catch(err){console.error('[FACILITY OPS v0.4.2 MFA prepare]',err);errorEl.textContent=err?.message||'2FA 정보를 준비하지 못했습니다.';}
    finally{gate.busy=false;}
  }

  async function verifyMfa(){
    const gate=mfaGate;if(!gate||gate.busy)return;
    const root=ensureMfaOverlay();const input=root.querySelector('#v042MfaCode');const errorEl=root.querySelector('#v042MfaError');
    const code=String(input?.value||'').replace(/\D/g,'').slice(0,6);if(code.length!==6){errorEl.textContent='Authenticator의 6자리 코드를 입력해 주세요.';return;}
    const factorId=gate.factor?.id||gate.enrollment?.id;if(!factorId){await prepareMfa();return;}
    gate.busy=true;const btn=root.querySelector('#v042MfaVerify');btn.disabled=true;btn.textContent='확인 중...';errorEl.textContent='';
    try{
      const {error}=await gate.client.auth.mfa.challengeAndVerify({factorId,code});if(error)throw error;
      const aal=await gate.client.auth.mfa.getAuthenticatorAssuranceLevel();if(aal.error)throw aal.error;if(aal.data?.currentLevel!=='aal2')throw new Error('2단계 인증 세션으로 승격되지 않았습니다.');
      root.hidden=true;input.value='';const done=mfaGate;mfaGate=null;done.resolve(true);
    }catch(err){console.error('[FACILITY OPS v0.4.2 MFA verify]',err);errorEl.textContent='인증 실패 · '+(err?.message||'코드를 다시 확인해 주세요.');input?.select();}
    finally{gate.busy=false;btn.disabled=false;btn.textContent='인증';}
  }

  async function requireAdminMfa(client){
    if(mfaGate)return mfaGate.promise;
    let resolve;const promise=new Promise(r=>resolve=r);mfaGate={client,resolve,promise,factor:null,enrollment:null,busy:false};
    const root=ensureMfaOverlay();root.hidden=false;await prepareMfa();return promise;
  }

  async function beforeDataLoad(client,user){
    lastClient=client;
    if(!client||!user)return false;
    const profileResult=await client.from('profiles').select('id,display_name,role,approved').eq('id',user.id).maybeSingle();
    if(profileResult.error)throw profileResult.error;
    lastProfile=profileResult.data||null;
    if(lastProfile?.approved===false){try{await client.auth.signOut();}catch(_){}const el=document.getElementById('loginError');if(el)el.textContent='이 계정은 아직 관리자의 사용 승인을 받지 않았습니다.';return false;}
    if(!isAdminProfile(lastProfile))return true;
    const aal=await client.auth.mfa.getAuthenticatorAssuranceLevel();if(aal.error)throw aal.error;
    if(aal.data?.currentLevel==='aal2')return true;
    return requireAdminMfa(client);
  }

  function captchaRequired(){return !!SITE_KEY;}
  function getCaptchaToken(){return captchaToken;}
  function resetCaptcha(){captchaToken='';try{if(window.turnstile&&captchaWidgetId!==null)window.turnstile.reset(captchaWidgetId);}catch(_){}}
  function renderCaptcha(){
    if(!SITE_KEY||!window.turnstile)return;const box=document.getElementById('facilityCaptchaV042');if(!box||captchaWidgetId!==null)return;
    try{captchaWidgetId=window.turnstile.render(box,{sitekey:SITE_KEY,theme:'auto',callback:t=>captchaToken=String(t||''),'expired-callback':()=>captchaToken='','error-callback':()=>captchaToken='' });}catch(err){console.error('[FACILITY OPS v0.4.2 CAPTCHA]',err);}
  }
  function mountCaptcha(){
    if(!SITE_KEY)return;const form=document.getElementById('loginForm');if(!form)return;
    let box=document.getElementById('facilityCaptchaV042');if(!box){box=document.createElement('div');box.id='facilityCaptchaV042';box.style.cssText='display:grid;place-items:center;min-height:0;margin-top:2px';const submit=form.querySelector('button[type="submit"]');form.insertBefore(box,submit||null);}
    if(window.turnstile){renderCaptcha();return;}if(document.getElementById('facilityTurnstileV042'))return;
    const script=document.createElement('script');script.id='facilityTurnstileV042';script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.onload=renderCaptcha;document.head.appendChild(script);
  }

  function ensureSecurityOverlay(){
    let root=document.getElementById('securityTestV042');if(root)return root;
    root=document.createElement('div');root.id='securityTestV042';root.className='v042-overlay';root.hidden=true;
    root.innerHTML=`<div class="v042-card" role="dialog" aria-modal="true"><div class="eyebrow">FACILITY OPS / SECURITY TEST</div><h2>운영 보안 자가점검</h2><p>보안 레이어만 점검하며 기존 사용자 권한 로직은 변경하지 않습니다.</p><div class="v042-sec-list" id="v042SecurityList"></div><div class="v042-actions"><button class="primary-btn" id="v042SecurityAgain" type="button">다시 점검</button><button class="ghost-btn" id="v042SecurityClose" type="button">닫기</button></div></div>`;
    document.body.appendChild(root);root.querySelector('#v042SecurityClose').onclick=()=>root.hidden=true;root.querySelector('#v042SecurityAgain').onclick=runSecurityTest;return root;
  }
  function ensureSecurityButton(){
    const logout=document.getElementById('logoutBtn');if(!logout)return;let btn=document.getElementById('securityTestBtnV042');
    if(!btn){btn=document.createElement('button');btn.id='securityTestBtnV042';btn.type='button';btn.className='ghost-btn full';btn.textContent='보안 점검';btn.onclick=runSecurityTest;logout.parentNode.insertBefore(btn,logout);}
    const admin=document.querySelector('#userChip small')?.textContent?.trim()==='관리자';btn.hidden=!admin;btn.style.display=admin?'':'none';
  }
  async function runSecurityTest(){
    if(document.querySelector('#userChip small')?.textContent?.trim()!=='관리자')return;
    const root=ensureSecurityOverlay();root.hidden=false;const list=root.querySelector('#v042SecurityList');const rows=[];const add=(ok,title,text)=>rows.push({ok,title,text});
    add(location.protocol==='https:','HTTPS',location.protocol==='https:'?'HTTPS 접속':'HTTPS가 아닙니다.');
    const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';add(csp.includes("default-src 'self'")&&csp.includes("object-src 'none'"),'CSP',csp?'CSP 적용됨':'CSP 없음');
    const robots=document.querySelector('meta[name="robots"]')?.content||'';add(/noindex/i.test(robots),'NOINDEX',/noindex/i.test(robots)?'검색 색인 차단':'noindex 없음');
    add(!!document.querySelector(`[data-facility-pinned-sdk="${SDK_VERSION}"]`),'SDK PIN','Supabase JS '+SDK_VERSION+' 고정');
    const setupVisible=[...document.querySelectorAll('[data-auth-tab="setup"],#authPane-setup')].some(x=>!x.hidden&&getComputedStyle(x).display!=='none');add(!setupVisible,'운영 연결','Supabase 연결 변경 UI '+(setupVisible?'노출됨':'제거됨'));
    add(SITE_KEY,'CAPTCHA',SITE_KEY?'Turnstile Site Key 설정됨':'Site Key 미설정');
    add(PASSWORD.minLength>=12&&PASSWORD.requireLower&&PASSWORD.requireUpper&&PASSWORD.requireNumber&&PASSWORD.requireSymbol,'비밀번호 정책',`${PASSWORD.minLength}자 + 대/소문자 + 숫자 + 기호 목표`);
    if(lastClient){try{const r=await lastClient.rpc('facility_ops_security_status');if(r.error)throw r.error;add(!r.data?.admin_role||r.data?.admin_mfa_ok,'관리자 2FA',r.data?.admin_role?'현재 AAL: '+(r.data?.aal||'-'):'일반 사용자');}catch(err){add(false,'DB SECURITY','v0.4.2 SQL 적용 확인 필요 · '+(err?.message||err));}}
    list.innerHTML=rows.map(x=>`<div class="v042-sec-item"><b>${x.ok?'PASS':'CHECK'}</b><span><strong>${esc(x.title)}</strong><br>${esc(x.text)}</span></div>`).join('');
  }

  window.FACILITY_OPS_SECURITY={beforeDataLoad,captchaRequired,getCaptchaToken,resetCaptcha,runSecurityTest};
  document.addEventListener('DOMContentLoaded',()=>{mountCaptcha();ensureMfaOverlay();ensureSecurityOverlay();setTimeout(injectStyle,700);setTimeout(ensureSecurityButton,800);const observer=new MutationObserver(()=>ensureSecurityButton());observer.observe(document.body,{childList:true,subtree:true,characterData:true});},{once:true});
})();
