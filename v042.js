// FACILITY OPS v0.4.2 — SECURITY HARDENING
// 관리자 TOTP 2FA / Turnstile CAPTCHA / 비밀번호 정책 / 보안 자가점검
(function () {
  const CFG = window.FACILITY_OPS_CONFIG || {};
  const INTERNAL_LOGIN_DOMAIN = 'facility.local';
  const SDK_VERSION = CFG.supabaseJsVersion || '2.112.4';
  const CAPTCHA_SITE_KEY = String(CFG.turnstileSiteKey || '').trim();
  const PASSWORD = Object.assign({
    minLength: 12,
    requireLower: true,
    requireUpper: true,
    requireNumber: true,
    requireSymbol: true
  }, CFG.passwordPolicy || {});

  let captchaToken = '';
  let captchaWidgetId = null;
  let authPatchedClient = null;
  let loadDataPatched = false;
  let realtimePatched = false;
  let adminAal2 = false;
  let mfaBusy = false;
  let mfaFactor = null;
  let enrollment = null;
  let uiQueued = false;

  function safeEsc(v) {
    try { return typeof esc === 'function' ? esc(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    catch (_) { return String(v ?? ''); }
  }

  function say(message) {
    try { if (typeof toast === 'function') { toast(message); return; } } catch (_) {}
    alert(message);
  }

  function isAdminProfile(profile) {
    return profile?.approved !== false && profile?.role === 'admin';
  }

  function currentUid() {
    try { return currentUser?.id || null; } catch (_) { return null; }
  }

  function passwordProblems(password) {
    const v = String(password || '');
    const issues = [];
    if (v.length < Number(PASSWORD.minLength || 12)) issues.push(`${PASSWORD.minLength || 12}자 이상`);
    if (PASSWORD.requireLower && !/[a-z]/.test(v)) issues.push('영문 소문자');
    if (PASSWORD.requireUpper && !/[A-Z]/.test(v)) issues.push('영문 대문자');
    if (PASSWORD.requireNumber && !/[0-9]/.test(v)) issues.push('숫자');
    if (PASSWORD.requireSymbol && !/[^A-Za-z0-9]/.test(v)) issues.push('특수문자');
    return issues;
  }

  function installPasswordGuard() {
    if (document.documentElement.dataset.v042PasswordGuard === '1') return;
    document.documentElement.dataset.v042PasswordGuard = '1';
    document.addEventListener('submit', function(event) {
      if (event.target?.id !== 'loginForm') return;
      const password = document.getElementById('loginPassword')?.value || '';
      const problems = passwordProblems(password);
      if (!problems.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const el = document.getElementById('loginError');
      if (el) el.textContent = `보안 정책: 비밀번호에 ${problems.join(', ')} 조건이 필요합니다.`;
    }, true);
  }

  function injectStyles() {
    if (document.getElementById('facilityOpsV042Style')) return;
    const style = document.createElement('style');
    style.id = 'facilityOpsV042Style';
    style.textContent = `
      .sidebar .version{font-size:0!important}.sidebar .version::after{content:"FACILITY OPS v0.4.2 SECURITY HARDENING"!important;font-size:10px!important}
      .auth-logo p{font-size:0!important}.auth-logo p::after{content:"v0.4.2 SECURITY HARDENING"!important;font-size:11px!important}
      .v042-captcha{display:grid;place-items:center;min-height:0;margin-top:2px}
      .v042-captcha-note{font-size:9px;color:var(--muted);text-align:center;line-height:1.5}
      .v042-overlay{position:fixed;inset:0;z-index:180;background:rgba(2,8,14,.84);backdrop-filter:blur(10px);display:grid;place-items:center;padding:22px}
      .v042-overlay[hidden]{display:none}
      .v042-card{width:min(520px,96vw);max-height:92vh;overflow:auto;border:1px solid var(--line-strong);border-radius:22px;background:linear-gradient(145deg,var(--panel),var(--panel-2));box-shadow:0 30px 100px rgba(0,0,0,.52);padding:24px}
      .v042-card h2{margin:6px 0 8px;font-size:21px}.v042-card p{color:var(--muted);font-size:11px;line-height:1.65;margin:0 0 15px}
      .v042-qr{display:grid;place-items:center;background:#fff;border-radius:14px;padding:12px;width:220px;height:220px;margin:12px auto}.v042-qr img{max-width:196px;max-height:196px}
      .v042-secret{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;border:1px solid var(--line);background:var(--panel-3);border-radius:10px;padding:10px;color:var(--soft);font-size:10px;margin:9px 0 14px}
      .v042-code{width:100%;min-height:46px;border:1px solid var(--line);border-radius:11px;background:var(--panel-2);color:var(--text);padding:0 12px;font-size:18px;letter-spacing:.18em;text-align:center;outline:none}.v042-code:focus{border-color:color-mix(in srgb,var(--accent) 50%,var(--line))}
      .v042-actions{display:flex;gap:8px;margin-top:12px}.v042-actions>*{flex:1}
      .v042-error{min-height:18px;color:var(--alert);font-size:10px;margin-top:9px;text-align:center}.v042-ok{color:var(--normal)}
      .v042-sec-list{display:grid;gap:8px;margin-top:14px}.v042-sec-item{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:start;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:var(--panel-2)}.v042-sec-item b{font-size:10px}.v042-sec-item span{font-size:11px;color:var(--soft);line-height:1.5}.v042-pass b{color:var(--normal)}.v042-warn b{color:var(--watch)}.v042-fail b{color:var(--alert)}
      .v042-security-btn{margin-top:0}
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Cloudflare Turnstile CAPTCHA
  // ---------------------------------------------------------------------------
  function ensureCaptchaContainer() {
    const form = document.getElementById('loginForm');
    if (!form || document.getElementById('facilityCaptchaV042')) return;
    const wrap = document.createElement('div');
    wrap.id = 'facilityCaptchaV042';
    wrap.className = 'v042-captcha';
    if (!CAPTCHA_SITE_KEY) {
      wrap.innerHTML = '<div class="v042-captcha-note">CAPTCHA 준비됨 · Turnstile Site Key 입력 후 자동 활성화</div>';
    }
    const submit = form.querySelector('button[type="submit"]');
    form.insertBefore(wrap, submit || null);
  }

  function renderTurnstile() {
    if (!CAPTCHA_SITE_KEY || !window.turnstile) return;
    const box = document.getElementById('facilityCaptchaV042');
    if (!box || captchaWidgetId !== null) return;
    box.innerHTML = '';
    try {
      captchaWidgetId = window.turnstile.render(box, {
        sitekey: CAPTCHA_SITE_KEY,
        theme: 'auto',
        callback(token) { captchaToken = String(token || ''); },
        'expired-callback'() { captchaToken = ''; },
        'error-callback'() { captchaToken = ''; }
      });
    } catch (err) {
      console.error('[v0.4.2 Turnstile render]', err);
    }
  }

  function loadTurnstile() {
    ensureCaptchaContainer();
    if (!CAPTCHA_SITE_KEY) return;
    if (window.turnstile) { renderTurnstile(); return; }
    if (document.getElementById('facilityTurnstileV042')) return;
    const script = document.createElement('script');
    script.id = 'facilityTurnstileV042';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderTurnstile;
    document.head.appendChild(script);
  }

  function resetCaptcha() {
    captchaToken = '';
    try { if (window.turnstile && captchaWidgetId !== null) window.turnstile.reset(captchaWidgetId); } catch (_) {}
  }

  function patchAuthCaptcha() {
    let client;
    try { client = dbClient; } catch (_) { return; }
    if (!client?.auth || authPatchedClient === client) return;
    const original = client.auth.signInWithPassword?.bind(client.auth);
    if (!original) return;
    client.auth.signInWithPassword = async function(credentials) {
      if (CAPTCHA_SITE_KEY && !captchaToken) {
        return { data:{ user:null, session:null }, error:new Error('CAPTCHA 인증을 완료해 주세요.') };
      }
      const next = Object.assign({}, credentials, {
        options: Object.assign({}, credentials?.options || {}, CAPTCHA_SITE_KEY ? { captchaToken } : {})
      });
      try { return await original(next); }
      finally { if (CAPTCHA_SITE_KEY) setTimeout(resetCaptcha, 50); }
    };
    authPatchedClient = client;
  }

  // ---------------------------------------------------------------------------
  // 관리자 TOTP 2FA
  // ---------------------------------------------------------------------------
  function ensureMfaOverlay() {
    let root = document.getElementById('adminMfaV042');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'adminMfaV042';
    root.className = 'v042-overlay';
    root.hidden = true;
    root.innerHTML = `
      <div class="v042-card" role="dialog" aria-modal="true" aria-label="관리자 2단계 인증">
        <div class="eyebrow">FACILITY OPS / ADMIN SECURITY</div>
        <h2 id="v042MfaTitle">관리자 2단계 인증</h2>
        <p id="v042MfaHelp">관리자 계정은 비밀번호 인증 후 Authenticator 앱의 6자리 코드가 필요합니다.</p>
        <div id="v042EnrollBox" hidden>
          <div class="v042-qr"><img id="v042MfaQr" alt="2FA QR 코드"></div>
          <div class="v042-secret" id="v042MfaSecret"></div>
        </div>
        <input class="v042-code" id="v042MfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
        <div class="v042-actions">
          <button class="primary-btn" type="button" id="v042MfaVerify">인증</button>
          <button class="ghost-btn" type="button" id="v042MfaLogout">로그아웃</button>
        </div>
        <div class="v042-error" id="v042MfaError"></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#v042MfaVerify').onclick = verifyMfaCode;
    root.querySelector('#v042MfaCode').addEventListener('keydown', e => { if (e.key === 'Enter') verifyMfaCode(); });
    root.querySelector('#v042MfaLogout').onclick = async () => {
      try { await dbClient?.auth?.signOut(); } catch (_) {}
      root.hidden = true;
      enrollment = null; mfaFactor = null; adminAal2 = false;
    };
    return root;
  }

  function qrSource(raw) {
    const text = String(raw || '');
    if (text.startsWith('data:')) return text;
    if (text.trim().startsWith('<svg')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    return text;
  }

  async function ownProfile() {
    if (!dbClient || !currentUid()) return null;
    const { data, error } = await dbClient.from('profiles').select('*').eq('id', currentUid()).maybeSingle();
    if (error) throw error;
    if (data) {
      try { currentProfile = data; } catch (_) {}
      try { if (typeof updateUserUI === 'function') updateUserUI(); } catch (_) {}
    }
    return data;
  }

  async function aalInfo() {
    const { data, error } = await dbClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data || {};
  }

  async function startEnrollment(root) {
    if (enrollment || mfaBusy) return;
    mfaBusy = true;
    const errorEl = root.querySelector('#v042MfaError');
    errorEl.textContent = '2FA 등록 정보를 생성하는 중...';
    try {
      const { data, error } = await dbClient.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'FACILITY OPS 관리자'
      });
      if (error) throw error;
      enrollment = data;
      mfaFactor = data;
      root.querySelector('#v042MfaTitle').textContent = '관리자 2FA 최초 등록';
      root.querySelector('#v042MfaHelp').textContent = 'Authenticator 앱에서 QR 코드를 스캔한 뒤 표시되는 6자리 코드를 입력하세요.';
      const box = root.querySelector('#v042EnrollBox');
      box.hidden = false;
      root.querySelector('#v042MfaQr').src = qrSource(data?.totp?.qr_code || '');
      root.querySelector('#v042MfaSecret').textContent = data?.totp?.secret ? `수동 등록 키: ${data.totp.secret}` : 'QR 코드를 스캔해 주세요.';
      errorEl.textContent = '';
      root.querySelector('#v042MfaCode').focus();
    } catch (err) {
      console.error('[v0.4.2 MFA enroll]', err);
      errorEl.textContent = err?.message || '2FA 등록 정보를 만들지 못했습니다.';
    } finally { mfaBusy = false; }
  }

  async function requireAdminMfa(profile=null) {
    if (!dbClient || !currentUid()) return true;
    const p = profile || await ownProfile();
    if (!isAdminProfile(p)) {
      adminAal2 = false;
      ensureMfaOverlay().hidden = true;
      return true;
    }

    const aal = await aalInfo();
    if (aal.currentLevel === 'aal2') {
      adminAal2 = true;
      ensureMfaOverlay().hidden = true;
      return true;
    }

    adminAal2 = false;
    const root = ensureMfaOverlay();
    root.hidden = false;
    try { if (typeof setOnlineStatus === 'function') setOnlineStatus('관리자 2FA 필요', false); } catch (_) {}

    const { data, error } = await dbClient.auth.mfa.listFactors();
    if (error) throw error;
    const totp = (data?.totp || []).filter(x => !x.status || x.status === 'verified');
    mfaFactor = totp[0] || null;

    if (mfaFactor) {
      enrollment = null;
      root.querySelector('#v042MfaTitle').textContent = '관리자 2단계 인증';
      root.querySelector('#v042MfaHelp').textContent = 'Authenticator 앱에 표시되는 6자리 코드를 입력하세요.';
      root.querySelector('#v042EnrollBox').hidden = true;
      root.querySelector('#v042MfaError').textContent = '';
      setTimeout(() => root.querySelector('#v042MfaCode')?.focus(), 20);
    } else {
      await startEnrollment(root);
    }
    return false;
  }

  async function verifyMfaCode() {
    if (mfaBusy || !dbClient) return;
    const root = ensureMfaOverlay();
    const input = root.querySelector('#v042MfaCode');
    const errorEl = root.querySelector('#v042MfaError');
    const code = String(input?.value || '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) { errorEl.textContent = 'Authenticator의 6자리 코드를 입력해 주세요.'; return; }
    const factorId = mfaFactor?.id || enrollment?.id;
    if (!factorId) { errorEl.textContent = '2FA 인증 정보를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.'; return; }

    mfaBusy = true;
    const btn = root.querySelector('#v042MfaVerify');
    btn.disabled = true; btn.textContent = '확인 중...';
    errorEl.textContent = '';
    try {
      const { error } = await dbClient.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      const aal = await aalInfo();
      if (aal.currentLevel !== 'aal2') throw new Error('2단계 인증 세션으로 승격되지 않았습니다.');
      adminAal2 = true;
      root.hidden = true;
      input.value = '';
      enrollment = null;
      mfaFactor = null;
      say('관리자 2단계 인증이 완료되었습니다.');
      try { await loadRemoteData(false); } catch (_) {}
      try { if (typeof startRealtime === 'function') startRealtime(); } catch (_) {}
    } catch (err) {
      console.error('[v0.4.2 MFA verify]', err);
      errorEl.textContent = '인증 실패 · ' + (err?.message || '코드를 다시 확인해 주세요.');
      input?.select();
    } finally {
      mfaBusy = false;
      btn.disabled = false; btn.textContent = '인증';
    }
  }

  function patchLoadRemoteDataForMfa() {
    if (loadDataPatched) return;
    try {
      if (typeof loadRemoteData !== 'function') return;
      const original = loadRemoteData;
      const wrapped = async function(...args) {
        if (currentUid() && dbClient) {
          try {
            const p = await ownProfile();
            if (isAdminProfile(p)) {
              const ok = await requireAdminMfa(p);
              if (!ok) {
                try { if (typeof setSyncing === 'function') setSyncing(false); } catch (_) {}
                return;
              }
            }
          } catch (err) {
            console.error('[v0.4.2 MFA preflight]', err);
          }
        }
        return original(...args);
      };
      wrapped.__facilityV042 = true;
      loadRemoteData = wrapped;
      try { window.loadRemoteData = wrapped; } catch (_) {}
      loadDataPatched = true;
    } catch (err) { console.error('[v0.4.2 loadRemoteData patch]', err); }
  }

  function patchRealtimeForMfa() {
    if (realtimePatched) return;
    try {
      if (typeof startRealtime !== 'function') return;
      const original = startRealtime;
      const wrapped = function(...args) {
        try { if (isAdminProfile(currentProfile) && !adminAal2) return; } catch (_) {}
        return original(...args);
      };
      wrapped.__facilityV042 = true;
      startRealtime = wrapped;
      try { window.startRealtime = wrapped; } catch (_) {}
      realtimePatched = true;
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 관리자 보안 자가점검
  // ---------------------------------------------------------------------------
  function ensureSecurityButton() {
    let btn = document.getElementById('securityTestBtnV042');
    const logout = document.getElementById('logoutBtn');
    if (!logout) return null;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'securityTestBtnV042';
      btn.type = 'button';
      btn.className = 'ghost-btn full v042-security-btn';
      btn.textContent = '보안 점검';
      btn.onclick = runSecurityTest;
      logout.parentNode.insertBefore(btn, logout);
    }
    let admin = false;
    try { admin = isAdminProfile(currentProfile); } catch (_) {}
    btn.hidden = !admin;
    btn.style.display = admin ? '' : 'none';
    return btn;
  }

  function ensureSecurityOverlay() {
    let root = document.getElementById('securityTestV042');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'securityTestV042';
    root.className = 'v042-overlay';
    root.hidden = true;
    root.innerHTML = `
      <div class="v042-card" role="dialog" aria-modal="true" aria-label="보안 점검">
        <div class="eyebrow">FACILITY OPS / SECURITY TEST</div>
        <h2>운영 보안 자가점검</h2>
        <p>브라우저 설정과 DB 권한을 실제로 확인합니다. 설정이 필요한 항목은 경고로 표시됩니다.</p>
        <div class="v042-sec-list" id="v042SecurityList"><div class="v042-sec-item"><b>점검 중</b><span>잠시만 기다려 주세요.</span></div></div>
        <div class="v042-actions"><button class="primary-btn" id="v042SecurityAgain" type="button">다시 점검</button><button class="ghost-btn" id="v042SecurityClose" type="button">닫기</button></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#v042SecurityClose').onclick = () => root.hidden = true;
    root.querySelector('#v042SecurityAgain').onclick = runSecurityTest;
    return root;
  }

  async function testAnonBlocked() {
    try {
      const url = String(CFG.supabaseUrl || '').replace(/\/+$/,'') + '/rest/v1/facilities?select=id&limit=1';
      const res = await fetch(url, { headers:{ apikey:CFG.supabaseKey }, cache:'no-store' });
      return res.status === 401 || res.status === 403;
    } catch (_) { return null; }
  }

  async function testRobotsFile() {
    try {
      const res = await fetch('robots.txt?security=042', { cache:'no-store' });
      if (!res.ok) return false;
      const text = await res.text();
      return /Disallow:\s*\//i.test(text);
    } catch (_) { return null; }
  }

  async function runSecurityTest() {
    let admin = false;
    try { admin = isAdminProfile(currentProfile); } catch (_) {}
    if (!admin) { say('관리자만 보안 점검을 실행할 수 있습니다.'); return; }
    const root = ensureSecurityOverlay();
    root.hidden = false;
    const list = root.querySelector('#v042SecurityList');
    list.innerHTML = '<div class="v042-sec-item"><b>점검 중</b><span>브라우저 및 DB 정책 확인 중...</span></div>';

    const checks = [];
    const add = (status, title, text) => checks.push({status,title,text});

    add(location.protocol === 'https:' ? 'pass' : 'fail', 'HTTPS', location.protocol === 'https:' ? 'HTTPS로 접속 중' : 'HTTPS가 아닙니다.');

    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
    add(csp.includes("default-src 'self'") && csp.includes("object-src 'none'") ? 'pass' : 'fail', 'CSP', csp ? 'Content Security Policy 적용됨' : 'CSP가 없습니다.');

    const robotsMeta = document.querySelector('meta[name="robots"]')?.content || '';
    add(/noindex/i.test(robotsMeta) ? 'pass' : 'fail', 'NOINDEX', /noindex/i.test(robotsMeta) ? '검색엔진 색인 차단 메타 적용' : 'noindex 메타가 없습니다.');

    const pinned = document.querySelector(`[data-facility-pinned-sdk="${CSS.escape(SDK_VERSION)}"]`);
    add(!!pinned, 'SDK PIN', pinned ? `Supabase JS ${SDK_VERSION} 고정 실행` : `Supabase JS ${SDK_VERSION} 고정 스크립트 확인 실패`);

    const setupVisible = [...document.querySelectorAll('[data-auth-tab="setup"],#authPane-setup')].some(x => !x.hidden && getComputedStyle(x).display !== 'none');
    add(!setupVisible, '운영 연결', !setupVisible ? 'Supabase 연결 변경 UI 제거됨' : '연결 설정 UI가 노출되어 있습니다.');

    add(PASSWORD.minLength >= 12 && PASSWORD.requireLower && PASSWORD.requireUpper && PASSWORD.requireNumber && PASSWORD.requireSymbol ? 'pass' : 'warn', '비밀번호', `클라이언트 정책 ${PASSWORD.minLength}자 + 대/소문자 + 숫자 + 기호`);
    add(CAPTCHA_SITE_KEY ? 'pass' : 'warn', 'CAPTCHA', CAPTCHA_SITE_KEY ? 'Turnstile Site Key 설정됨' : 'Turnstile Site Key 입력 및 Supabase CAPTCHA 활성화 필요');

    try {
      const { data, error } = await dbClient.rpc('facility_ops_security_status');
      if (error) throw error;
      add(data?.approved ? 'pass' : 'fail', '계정 승인', data?.approved ? '승인된 운영 계정' : '미승인 계정');
      add(!data?.admin_role || data?.admin_mfa_ok ? 'pass' : 'fail', '관리자 2FA', data?.admin_role ? `현재 AAL: ${data?.aal || '-'}` : '일반 사용자 계정');
    } catch (err) {
      add('fail', 'DB SECURITY', 'v0.4.2 SQL 적용 필요 · ' + (err?.message || err));
    }

    const anon = await testAnonBlocked();
    add(anon === true ? 'pass' : anon === false ? 'fail' : 'warn', 'ANON 차단', anon === true ? '비로그인 REST 접근 차단 확인' : anon === false ? '비로그인 REST 접근이 허용됨' : '네트워크 문제로 확인하지 못함');

    const robots = await testRobotsFile();
    add(robots === true ? 'pass' : robots === false ? 'warn' : 'warn', 'robots.txt', robots === true ? '전체 크롤링 차단 규칙 확인' : 'robots.txt 배포 확인 필요');

    add('warn', '서버 설정', 'Supabase Dashboard에서 CAPTCHA Secret / Password Security / 신규 가입 차단 상태는 별도 확인 필요');

    list.innerHTML = checks.map(x => `<div class="v042-sec-item v042-${x.status}"><b>${x.status==='pass'?'PASS':x.status==='fail'?'FAIL':'CHECK'}</b><span><strong>${safeEsc(x.title)}</strong><br>${safeEsc(x.text)}</span></div>`).join('');
  }

  function updateUi() {
    uiQueued = false;
    injectStyles();
    installPasswordGuard();
    ensureCaptchaContainer();
    loadTurnstile();
    patchAuthCaptcha();
    patchLoadRemoteDataForMfa();
    patchRealtimeForMfa();
    ensureSecurityButton();
  }

  function queueUi() {
    if (uiQueued) return;
    uiQueued = true;
    requestAnimationFrame(updateUi);
  }

  injectStyles();
  installPasswordGuard();
  ensureMfaOverlay();
  ensureSecurityOverlay();

  setTimeout(async () => {
    updateUi();
    const observer = new MutationObserver(queueUi);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });

    // 새로고침으로 이미 로그인 세션이 복구된 경우도 관리자 2FA를 다시 확인합니다.
    try {
      if (currentUid() && dbClient) {
        const p = await ownProfile();
        if (isAdminProfile(p)) await requireAdminMfa(p);
      }
    } catch (err) {
      console.warn('[v0.4.2 initial MFA check]', err);
    }
  }, 180);
})();
