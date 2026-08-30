window.FACILITY_OPS_CONFIG = {
  supabaseUrl: "https://rmkjiqzcxbxwbiwqjjcz.supabase.co",
  supabaseKey: "sb_publishable_Vb2sf5s6hJbr0FuNVx1oxA_Epbqu3yV",

  // SECURITY HARDENING
  supabaseJsVersion: "2.112.4",
  // Cloudflare Turnstile 생성 후 Site Key만 여기에 넣으세요. Secret Key는 절대 GitHub에 넣지 않습니다.
  turnstileSiteKey: "",
  passwordPolicy: {
    minLength: 12,
    requireLower: true,
    requireUpper: true,
    requireNumber: true,
    requireSymbol: true
  }
};

// FACILITY OPS v0.4.2 — SECURITY HARDENING bootstrap
(function () {
  const CFG = window.FACILITY_OPS_CONFIG || {};
  const INTERNAL_LOGIN_DOMAIN = 'facility.local';
  const THEME_KEY = 'facility_ops_theme';
  const SDK_VERSION = CFG.supabaseJsVersion || '2.112.4';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let volatileTheme = null;
  let refreshQueued = false;

  function installSecurityMeta() {
    const head = document.head || document.documentElement;
    if (!head) return;

    if (!document.querySelector('meta[name="robots"]')) {
      const robots = document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex,nofollow,noarchive,nosnippet,noimageindex';
      head.prepend(robots);
    }
    if (!document.querySelector('meta[name="googlebot"]')) {
      const google = document.createElement('meta');
      google.name = 'googlebot';
      google.content = 'noindex,nofollow,noarchive,nosnippet,noimageindex';
      head.prepend(google);
    }
    if (!document.querySelector('meta[name="referrer"]')) {
      const ref = document.createElement('meta');
      ref.name = 'referrer';
      ref.content = 'no-referrer';
      head.prepend(ref);
    }

    if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
      let supabaseHttps = '';
      let supabaseWss = '';
      try {
        const u = new URL(CFG.supabaseUrl);
        supabaseHttps = u.origin;
        supabaseWss = 'wss://' + u.host;
      } catch (_) {}
      const csp = document.createElement('meta');
      csp.httpEquiv = 'Content-Security-Policy';
      // index.html의 기존 인라인 앱 코드 때문에 script/style의 unsafe-inline은 당분간 유지합니다.
      // 외부 출처는 Supabase SDK CDN과 Turnstile로만 제한합니다.
      csp.content = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src 'self' ${supabaseHttps} ${supabaseWss} https://challenges.cloudflare.com`.trim(),
        "frame-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "upgrade-insecure-requests"
      ].join('; ');
      head.prepend(csp);
    }
  }
  installSecurityMeta();

  // Supabase Auth 세션을 localStorage + sessionStorage 양쪽에 저장합니다.
  function makeResilientAuthStorage() {
    function stores() {
      const out = [];
      try { if (window.localStorage) out.push(window.localStorage); } catch (_) {}
      try { if (window.sessionStorage) out.push(window.sessionStorage); } catch (_) {}
      return out;
    }
    return {
      getItem(key) {
        for (const s of stores()) {
          try { const v = s.getItem(key); if (v !== null && v !== undefined) return v; } catch (_) {}
        }
        return null;
      },
      setItem(key, value) {
        let ok = false;
        for (const s of stores()) { try { s.setItem(key, value); ok = true; } catch (_) {} }
        if (!ok) console.warn('[FACILITY OPS] 세션 저장소 사용 불가');
      },
      removeItem(key) {
        for (const s of stores()) { try { s.removeItem(key); } catch (_) {}
      }
    };
  }

  window.__FACILITY_PATCH_SUPABASE__ = function () {
    try {
      const api = window.supabase;
      if (!api?.createClient || api.createClient.__facilityV042) return;
      const original = api.createClient.bind(api);
      const storage = makeResilientAuthStorage();
      const wrapped = function(url, key, options={}) {
        const auth = Object.assign({}, options.auth || {}, {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage
        });
        return original(url, key, Object.assign({}, options, { auth }));
      };
      wrapped.__facilityV042 = true;
      api.createClient = wrapped;
    } catch (err) {
      console.error('[FACILITY OPS v0.4.2 Supabase patch]', err);
    }
  };

  // index.html의 @2 부동 버전이 먼저 로드되어 있더라도 앱이 실제 사용하는 SDK는
  // 아래 정확한 버전을 다시 로드해 고정합니다.
  try {
    if (document.readyState === 'loading' && !document.querySelector('[data-facility-pinned-sdk]')) {
      document.write('<scr' + 'ipt data-facility-pinned-sdk="' + SDK_VERSION + '" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@' + SDK_VERSION + '/dist/umd/supabase.js" crossorigin="anonymous" onload="window.__FACILITY_PATCH_SUPABASE__()"></scr' + 'ipt>');
    } else {
      window.__FACILITY_PATCH_SUPABASE__();
    }
  } catch (_) {
    window.__FACILITY_PATCH_SUPABASE__();
  }

  function isAdminUi() {
    return document.querySelector('#userChip small')?.textContent?.trim() === '관리자';
  }

  function notify(message) {
    try { if (typeof toast === 'function') { toast(message); return; } } catch (_) {}
    alert(message);
  }

  function safeGetTheme() {
    try { return localStorage.getItem(THEME_KEY) || sessionStorage.getItem(THEME_KEY) || volatileTheme; }
    catch (_) { return volatileTheme; }
  }

  function safeSetTheme(value) {
    volatileTheme = value;
    try { localStorage.setItem(THEME_KEY, value); } catch (_) {}
    try { sessionStorage.setItem(THEME_KEY, value); } catch (_) {}
  }

  function applyThemeVisual(value) {
    const light = value === 'light';
    document.body.classList.toggle('light', light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    const btn = document.getElementById('themeBtn');
    if (btn) {
      btn.textContent = light ? '☀' : '◐';
      btn.title = light ? '다크 모드로 전환' : '라이트 모드로 전환';
    }
  }

  function patchIdLogin() {
    const input = document.getElementById('loginEmail');
    if (input) {
      input.type = 'text';
      input.placeholder = '예: admin';
      input.autocapitalize = 'none';
      input.spellcheck = false;
      const label = input.closest('.auth-field')?.querySelector('label');
      if (label) label.textContent = '아이디';
    }
    const help = document.querySelector('#authPane-login .auth-help');
    if (help) help.textContent = '승인된 아이디와 비밀번호로 로그인하세요. 관리자 계정은 2단계 인증이 추가로 필요합니다.';

    try {
      if (typeof loginWithPassword === 'function' && !loginWithPassword.__idLoginV042) {
        const original = loginWithPassword;
        const wrapped = async function(loginId, password) {
          const id = String(loginId || '').trim().toLowerCase();
          const errorEl = document.getElementById('loginError');
          if (!id) { if (errorEl) errorEl.textContent = '아이디를 입력해 주세요.'; return; }
          const email = id.includes('@') ? id : id + '@' + INTERNAL_LOGIN_DOMAIN;
          return original(email, password);
        };
        wrapped.__idLoginV042 = true;
        loginWithPassword = wrapped;
        try { window.loginWithPassword = wrapped; } catch (_) {}
      }
    } catch (_) {}
  }

  // 운영판에서는 Project URL/Key 변경 기능을 완전히 숨깁니다.
  function removeRuntimeConnectionSettings() {
    const setupTab = document.querySelector('[data-auth-tab="setup"]');
    if (setupTab) { setupTab.hidden = true; setupTab.style.display = 'none'; }
    const setupPane = document.getElementById('authPane-setup');
    if (setupPane) { setupPane.classList.remove('active'); setupPane.hidden = true; setupPane.style.display = 'none'; }
    ['adminConnectionBtnV04','adminConnectionBtnV033','setupBackBtnV04','setupBackBtnV033'].forEach(id => document.getElementById(id)?.remove());
    document.getElementById('authPane-login')?.classList.add('active');
    document.querySelector('[data-auth-tab="login"]')?.classList.add('active');
  }

  function applyAdminVisibility() {
    const admin = isAdminUi();
    const exportBtn = document.getElementById('exportBtn');
    const importLabel = document.getElementById('importInput')?.closest('label');
    if (exportBtn) { exportBtn.hidden = !admin; exportBtn.style.display = admin ? '' : 'none'; }
    if (importLabel) { importLabel.hidden = !admin; importLabel.style.display = admin ? '' : 'none'; }
    removeRuntimeConnectionSettings();
  }

  function scrubUuid() {
    document.querySelectorAll('.detail-code').forEach(el => {
      if (UUID_RE.test(String(el.textContent || '').trim())) { el.textContent = '▦'; el.title = '시설'; }
    });
    document.querySelectorAll('.panel-title small').forEach(el => {
      if (UUID_RE.test(String(el.textContent || '').trim())) el.textContent = '시설 정보';
    });
  }

  function refreshUi() {
    refreshQueued = false;
    patchIdLogin();
    applyAdminVisibility();
    scrubUuid();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refreshUi);
  }

  document.addEventListener('click', function(event) {
    const theme = event.target.closest?.('#themeBtn');
    if (theme) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      safeSetTheme(next);
      applyThemeVisual(next);
      return;
    }
    if (event.target.closest?.('#exportBtn') && !isAdminUi()) {
      event.preventDefault(); event.stopImmediatePropagation(); notify('관리자만 데이터를 내보낼 수 있습니다.');
    }
    if (event.target.closest?.('[data-auth-tab="setup"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('change', function(event) {
    if (event.target?.id === 'importInput' && !isAdminUi()) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { event.target.value = ''; } catch (_) {}
      notify('관리자만 백업 데이터를 가져올 수 있습니다.');
    }
  }, true);

  function loadScript(id, src) {
    return new Promise((resolve, reject) => {
      const old = document.getElementById(id);
      if (old) { resolve(); return; }
      const s = document.createElement('script');
      s.id = id;
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  async function loadSecurityScripts() {
    try {
      await loadScript('facilityOpsV04Script', 'v04.js?v=042-base');
      await loadScript('facilityOpsV041Script', 'v041.js?v=042-core');
      await loadScript('facilityOpsV042Script', 'v042.js?v=042');
    } catch (err) {
      console.error('[FACILITY OPS] 보안 모듈 로드 실패', err);
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      window.__FACILITY_PATCH_SUPABASE__();
      const saved = safeGetTheme();
      applyThemeVisual(saved === 'light' || saved === 'dark' ? saved : (document.body.classList.contains('light') ? 'light' : 'dark'));
      refreshUi();
      removeRuntimeConnectionSettings();
      const observer = new MutationObserver(queueRefresh);
      observer.observe(document.body, { childList:true, subtree:true, characterData:true });
      loadSecurityScripts();
    }, 40);
  }, { once:true });
})();
