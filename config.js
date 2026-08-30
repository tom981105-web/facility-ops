window.FACILITY_OPS_CONFIG = {
  supabaseUrl: "https://rmkjiqzcxbxwbiwqjjcz.supabase.co",
  supabaseKey: "sb_publishable_Vb2sf5s6hJbr0FuNVx1oxA_Epbqu3yV"
};

// FACILITY OPS v0.4.1 — SECURITY CORE bootstrap
(function () {
  const INTERNAL_LOGIN_DOMAIN = 'facility.local';
  const THEME_KEY = 'facility_ops_theme';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let volatileTheme = null;
  let refreshQueued = false;

  // ---------------------------------------------------------------------------
  // 새로고침 시 로그인 유지 강화
  // Supabase Auth 저장소를 localStorage + sessionStorage 이중 저장으로 구성합니다.
  // ---------------------------------------------------------------------------
  function makeResilientAuthStorage() {
    function availableStores() {
      const stores = [];
      try { if (window.localStorage) stores.push(window.localStorage); } catch (_) {}
      try { if (window.sessionStorage) stores.push(window.sessionStorage); } catch (_) {}
      return stores;
    }
    return {
      getItem(key) {
        for (const store of availableStores()) {
          try {
            const value = store.getItem(key);
            if (value !== null && value !== undefined) return value;
          } catch (_) {}
        }
        return null;
      },
      setItem(key, value) {
        let saved = false;
        for (const store of availableStores()) {
          try { store.setItem(key, value); saved = true; } catch (_) {}
        }
        if (!saved) console.warn('[FACILITY OPS] 브라우저 세션 저장소를 사용할 수 없습니다.');
      },
      removeItem(key) {
        for (const store of availableStores()) {
          try { store.removeItem(key); } catch (_) {}
        }
      }
    };
  }

  function patchSupabasePersistence() {
    try {
      const api = window.supabase;
      if (!api?.createClient || api.createClient.__facilityV041) return;
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
      wrapped.__facilityV041 = true;
      api.createClient = wrapped;
    } catch (err) {
      console.error('[FACILITY OPS v0.4.1 session storage]', err);
    }
  }
  patchSupabasePersistence();

  function isAdminUi() {
    try {
      return currentProfile?.role === 'admin'
        && currentProfile?.approved !== false
        && (!currentProfile?.account_status || currentProfile.account_status === 'active');
    } catch (_) { return false; }
  }

  function notify(message) {
    try { if (typeof toast === 'function') { toast(message); return; } } catch (_) {}
    alert(message);
  }

  function safeGetTheme() {
    try { return localStorage.getItem(THEME_KEY) || volatileTheme; } catch (_) { return volatileTheme; }
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
      btn.setAttribute('aria-label', btn.title);
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
    if (help) help.textContent = '관리자에게 발급받고 승인된 아이디와 비밀번호로 로그인하세요.';

    try {
      if (typeof loginWithPassword === 'function' && !loginWithPassword.__idLoginV041) {
        const original = loginWithPassword;
        const wrapped = async function(loginId, password) {
          const id = String(loginId || '').trim().toLowerCase();
          const errorEl = document.getElementById('loginError');
          if (!id) { if (errorEl) errorEl.textContent = '아이디를 입력해 주세요.'; return; }
          const email = id.includes('@') ? id : id + '@' + INTERNAL_LOGIN_DOMAIN;
          return original(email, password);
        };
        wrapped.__idLoginV041 = true;
        loginWithPassword = wrapped;
        try { window.loginWithPassword = wrapped; } catch (_) {}
      }
    } catch (_) {}
  }

  // 운영판에서는 Supabase URL/Key 변경 UI를 완전히 제거합니다.
  function removeRuntimeConnectionSettings() {
    const setupTab = document.querySelector('[data-auth-tab="setup"]');
    if (setupTab) {
      setupTab.hidden = true;
      setupTab.style.display = 'none';
    }
    const setupPane = document.getElementById('authPane-setup');
    if (setupPane) {
      setupPane.classList.remove('active');
      setupPane.hidden = true;
      setupPane.style.display = 'none';
    }
    document.getElementById('adminConnectionBtnV04')?.remove();
    document.getElementById('adminConnectionBtnV033')?.remove();
    document.getElementById('setupBackBtnV04')?.remove();
    document.getElementById('setupBackBtnV033')?.remove();

    const loginPane = document.getElementById('authPane-login');
    const loginTab = document.querySelector('[data-auth-tab="login"]');
    if (loginPane) loginPane.classList.add('active');
    if (loginTab) loginTab.classList.add('active');
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
      const t = String(el.textContent || '').trim();
      if (UUID_RE.test(t)) { el.textContent = '▦'; el.title = '시설'; }
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
      event.preventDefault();
      event.stopImmediatePropagation();
      notify('관리자만 데이터를 내보낼 수 있습니다.');
      return;
    }

    if (event.target.closest?.('[data-auth-tab="setup"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('change', function(event) {
    if (event.target?.id === 'importInput' && !isAdminUi()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { event.target.value = ''; } catch (_) {}
      notify('관리자만 백업 데이터를 가져올 수 있습니다.');
    }
  }, true);

  function loadSecurityScripts() {
    if (document.getElementById('facilityOpsV04Script')) return;
    const base = document.createElement('script');
    base.id = 'facilityOpsV04Script';
    base.src = 'v04.js?v=042-stable-base';
    base.async = false;
    base.onload = function() {
      if (document.getElementById('facilityOpsV041Script')) return;
      const security = document.createElement('script');
      security.id = 'facilityOpsV041Script';
      security.src = 'v041.js?v=043-final-core';
      security.async = false;
      security.onload = function() {
        if (document.getElementById('facilityOpsV043Script')) return;
        const finalSecurity = document.createElement('script');
        finalSecurity.id = 'facilityOpsV043Script';
        finalSecurity.src = 'v043.js?v=043-final-20260830';
        finalSecurity.async = false;
        finalSecurity.onload = function() {
          if (document.getElementById('facilityOpsUi043Script')) return;
          const ui = document.createElement('script');
          ui.id = 'facilityOpsUi043Script';
          ui.src = 'v043_ui.js?v=043-ops-ui-20260830b';
          ui.async = false;
          ui.onload = function() {
            if (!document.getElementById('facilityOpsLogoFix043')) {
              const logoFix = document.createElement('script');
              logoFix.id = 'facilityOpsLogoFix043';
              logoFix.src = 'v043_logo_fix.js?v=043-logo-fix-20260830';
              logoFix.async = false;
              document.body.appendChild(logoFix);
            }
            if (!document.getElementById('facilityOpsDashboard043')) {
              const dashboard = document.createElement('script');
              dashboard.id = 'facilityOpsDashboard043';
              dashboard.src = 'v043_dashboard.js?v=043-command-center-20260830';
              dashboard.async = false;
              document.body.appendChild(dashboard);
            }
          };
          document.body.appendChild(ui);
        };
        document.body.appendChild(finalSecurity);
      };
      document.body.appendChild(security);
    };
    document.body.appendChild(base);
  }

  // setupForm은 index.html의 init()이 바인딩한 뒤 제거해야 하므로 DOMContentLoaded 후 처리합니다.
  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      let saved = safeGetTheme();
      if (!saved) {
        try { saved = sessionStorage.getItem(THEME_KEY); } catch (_) {}
      }
      applyThemeVisual(saved === 'light' || saved === 'dark' ? saved : (document.body.classList.contains('light') ? 'light' : 'dark'));
      refreshUi();
      removeRuntimeConnectionSettings();

      const observer = new MutationObserver(queueRefresh);
      observer.observe(document.body, { childList:true, subtree:true, characterData:true });
      loadSecurityScripts();
    }, 40);
  }, { once:true });
})();
