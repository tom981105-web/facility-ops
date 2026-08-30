window.FACILITY_OPS_CONFIG = {
  // Supabase Dashboard > Project > Connect 또는 Settings > API Keys
  supabaseUrl: "https://rmkjiqzcxbxwbiwqjjcz.supabase.co",
  // 브라우저에 공개 가능한 Publishable Key(sb_publishable_...)만 입력하세요.
  // Secret Key / service_role 키는 절대로 입력하지 마세요.
  supabaseKey: "sb_publishable_Vb2sf5s6hJbr0FuNVx1oxA_Epbqu3yV"
};

// v0.3.1 hotfix: 회사 PC/브라우저 환경에서도 연결 테스트 버튼이
// 반드시 반응하도록 별도의 직접 클릭 핸들러를 붙입니다.
(function () {
  function attachConnectionHotfix() {
    const form = document.getElementById('setupForm');
    if (!form) return;
    const btn = form.querySelector('button');
    if (!btn || btn.dataset.connectionHotfix === '1') return;

    btn.dataset.connectionHotfix = '1';
    btn.type = 'button';

    btn.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopPropagation();

      const status = document.getElementById('setupError');
      const urlInput = document.getElementById('setupUrl');
      const keyInput = document.getElementById('setupKey');
      const originalText = btn.textContent;
      const cfg = {
        supabaseUrl: String(urlInput?.value || '').trim(),
        supabaseKey: String(keyInput?.value || '').trim()
      };

      if (status) {
        status.classList.remove('success');
        status.style.color = '#f0b84b';
        status.textContent = '● 버튼 정상 작동 · Supabase 연결 확인 중...';
      }
      btn.disabled = true;
      btn.textContent = '연결 확인 중...';

      await new Promise(resolve => requestAnimationFrame(() => resolve()));

      try {
        if (!cfg.supabaseUrl || !cfg.supabaseKey) {
          throw new Error('Project URL과 Publishable Key를 모두 입력해 주세요.');
        }

        let parsed;
        try {
          parsed = new URL(cfg.supabaseUrl);
        } catch (_) {
          throw new Error('Project URL 형식이 올바르지 않습니다.');
        }
        if (parsed.protocol !== 'https:') {
          throw new Error('Project URL은 https:// 주소여야 합니다.');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let response;
        try {
          response = await fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/auth/v1/settings', {
            method: 'GET',
            headers: { apikey: cfg.supabaseKey },
            cache: 'no-store',
            signal: controller.signal
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error('Publishable Key가 올바르지 않습니다.');
          }
          throw new Error('Supabase 응답 오류 (HTTP ' + response.status + ')');
        }

        try {
          localStorage.setItem('facility_ops_supabase_config', JSON.stringify(cfg));
        } catch (_) {}

        if (status) {
          status.classList.add('success');
          status.style.color = '#55d6ad';
          status.textContent = '✓ Supabase 서버 연결 성공 · 로그인 화면으로 이동합니다.';
        }

        await new Promise(resolve => setTimeout(resolve, 450));

        if (typeof window.bootConnection === 'function') {
          await window.bootConnection(cfg, true);
        } else if (typeof window.setAuthTab === 'function') {
          window.setAuthTab('login');
        } else {
          throw new Error('앱 초기화 스크립트를 불러오지 못했습니다. 새로고침해 주세요.');
        }
      } catch (err) {
        console.error('[FACILITY OPS connection hotfix]', err);
        if (status) {
          status.classList.remove('success');
          status.style.color = '#ff6b78';
          if (err?.name === 'AbortError') {
            status.textContent = '✕ 연결 시간 초과 · 회사 네트워크에서 Supabase가 차단되었을 수 있습니다.';
          } else if (err instanceof TypeError) {
            status.textContent = '✕ 네트워크 요청 실패 · 회사 보안정책 또는 인터넷 연결을 확인해 주세요.';
          } else {
            status.textContent = '✕ ' + (err?.message || '연결 테스트에 실패했습니다.');
          }
        }
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }, true);
  }

  attachConnectionHotfix();
  window.addEventListener('DOMContentLoaded', attachConnectionHotfix, { once: true });
})();

// v0.3.2: 직원은 실제 이메일 대신 아이디 + 비밀번호로 로그인합니다.
// Supabase 내부에서는 <아이디>@facility.local 형태의 계정을 사용합니다.
(function () {
  const INTERNAL_LOGIN_DOMAIN = 'facility.local';

  function attachIdLoginMode() {
    const input = document.getElementById('loginEmail');
    if (input && input.dataset.idLoginPatched !== '1') {
      input.dataset.idLoginPatched = '1';
      input.type = 'text';
      input.placeholder = '예: gyewon';
      input.autocapitalize = 'none';
      input.spellcheck = false;
      input.maxLength = 32;
      const label = input.closest('.auth-field')?.querySelector('label');
      if (label) label.textContent = '아이디';
    }

    const help = document.querySelector('#authPane-login .auth-help');
    if (help) help.textContent = '관리자에게 발급받은 아이디와 비밀번호로 로그인하면 같은 시설 데이터를 여러 PC에서 함께 사용할 수 있습니다.';

    const authVersion = document.querySelector('.auth-logo p');
    if (authVersion) authVersion.textContent = 'v0.3.2 ID LOGIN ONLINE';
    const sideVersion = document.querySelector('.sidebar .version');
    if (sideVersion) sideVersion.textContent = 'FACILITY OPS v0.3.2 ONLINE';

    if (typeof window.loginWithPassword === 'function' && !window.loginWithPassword.__facilityIdLoginPatched) {
      const originalLogin = window.loginWithPassword;
      const wrappedLogin = async function (loginId, password) {
        let id = String(loginId || '').trim().toLowerCase();
        const errorEl = document.getElementById('loginError');
        if (!id) {
          if (errorEl) errorEl.textContent = '아이디를 입력해 주세요.';
          return;
        }
        // 과거 실제 이메일 계정도 그대로 로그인할 수 있도록 호환 유지
        const email = id.includes('@') ? id : id + '@' + INTERNAL_LOGIN_DOMAIN;
        return originalLogin(email, password);
      };
      wrappedLogin.__facilityIdLoginPatched = true;
      window.loginWithPassword = wrappedLogin;
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    // 메인 스크립트 init() 이후에 덮어쓰도록 한 틱 뒤 적용
    setTimeout(attachIdLoginMode, 0);
  }, { once: true });
})();

// v0.3.3: 테마 안정화 / 내부 UUID 숨김 / 관리자 전용 관리 기능
(function () {
  const THEME_KEY = 'facility_ops_theme';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let volatileTheme = null;
  let adminSettingsOpen = false;
  let scheduled = false;

  function safeGetTheme() {
    try { return localStorage.getItem(THEME_KEY) || volatileTheme; }
    catch (_) { return volatileTheme; }
  }

  function safeSetTheme(value) {
    volatileTheme = value;
    try { localStorage.setItem(THEME_KEY, value); } catch (_) {}
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

  function toggleThemeSafe() {
    const next = document.body.classList.contains('light') ? 'dark' : 'light';
    safeSetTheme(next);
    applyThemeVisual(next);
  }

  function isAdminUi() {
    const role = document.querySelector('#userChip small')?.textContent?.trim();
    return role === '관리자';
  }

  function notify(message) {
    if (typeof window.toast === 'function') {
      try { window.toast(message); return; } catch (_) {}
    }
    alert(message);
  }

  function hideSetupForLogin() {
    const setupTab = document.querySelector('[data-auth-tab="setup"]');
    const gate = document.getElementById('authGate');
    if (!setupTab) return;
    if (!adminSettingsOpen || !isAdminUi()) {
      setupTab.hidden = true;
      setupTab.style.display = 'none';
      if (gate && !gate.hidden) {
        const setupPane = document.getElementById('authPane-setup');
        const loginPane = document.getElementById('authPane-login');
        const loginTab = document.querySelector('[data-auth-tab="login"]');
        setupPane?.classList.remove('active');
        loginPane?.classList.add('active');
        setupTab.classList.remove('active');
        loginTab?.classList.add('active');
      }
    }
  }

  function ensureAdminConnectionButton() {
    let btn = document.getElementById('adminConnectionBtnV033');
    if (btn) return btn;
    const logout = document.getElementById('logoutBtn');
    if (!logout) return null;
    btn = document.createElement('button');
    btn.id = 'adminConnectionBtnV033';
    btn.type = 'button';
    btn.className = 'ghost-btn full';
    btn.textContent = '연결 설정';
    btn.hidden = true;
    btn.style.display = 'none';
    logout.parentNode.insertBefore(btn, logout);
    return btn;
  }

  function ensureSetupBackButton() {
    let btn = document.getElementById('setupBackBtnV033');
    if (btn) return btn;
    const pane = document.getElementById('authPane-setup');
    if (!pane) return null;
    btn = document.createElement('button');
    btn.id = 'setupBackBtnV033';
    btn.type = 'button';
    btn.className = 'ghost-btn full';
    btn.textContent = '← 시스템으로 돌아가기';
    btn.style.marginTop = '8px';
    btn.addEventListener('click', function () {
      adminSettingsOpen = false;
      const gate = document.getElementById('authGate');
      if (gate) gate.hidden = true;
      const setupTab = document.querySelector('[data-auth-tab="setup"]');
      if (setupTab) {
        setupTab.hidden = true;
        setupTab.style.display = 'none';
      }
      if (typeof window.setAuthTab === 'function') {
        try { window.setAuthTab('login'); } catch (_) {}
      }
    });
    pane.appendChild(btn);
    return btn;
  }

  function openAdminConnectionSettings() {
    if (!isAdminUi()) {
      notify('관리자만 연결 설정을 열 수 있습니다.');
      return;
    }
    adminSettingsOpen = true;
    const gate = document.getElementById('authGate');
    const setupTab = document.querySelector('[data-auth-tab="setup"]');
    if (setupTab) {
      setupTab.hidden = false;
      setupTab.style.display = '';
    }
    ensureSetupBackButton();
    if (gate) gate.hidden = false;
    if (typeof window.setAuthTab === 'function') {
      try { window.setAuthTab('setup'); return; } catch (_) {}
    }
    document.getElementById('authPane-login')?.classList.remove('active');
    document.getElementById('authPane-setup')?.classList.add('active');
  }

  function applyAdminVisibility() {
    const admin = isAdminUi();
    const exportBtn = document.getElementById('exportBtn');
    const importInput = document.getElementById('importInput');
    const importLabel = importInput?.closest('label');
    const connectionBtn = ensureAdminConnectionButton();

    if (exportBtn) {
      exportBtn.hidden = !admin;
      exportBtn.style.display = admin ? '' : 'none';
    }
    if (importLabel) {
      importLabel.hidden = !admin;
      importLabel.style.display = admin ? '' : 'none';
    }
    if (connectionBtn) {
      connectionBtn.hidden = !admin;
      connectionBtn.style.display = admin ? '' : 'none';
      if (!connectionBtn.dataset.boundV033) {
        connectionBtn.dataset.boundV033 = '1';
        connectionBtn.addEventListener('click', openAdminConnectionSettings);
      }
    }

    // 로그인 화면에서는 연결 설정을 노출하지 않습니다.
    // 관리자가 로그인한 뒤 사이드바의 연결 설정 버튼으로만 접근합니다.
    hideSetupForLogin();
  }

  function scrubInternalIds() {
    document.querySelectorAll('.detail-code').forEach(function (el) {
      const text = String(el.textContent || '').trim();
      if (UUID_RE.test(text)) {
        el.textContent = '▦';
        el.title = '시설';
      }
    });

    document.querySelectorAll('.panel-title small').forEach(function (el) {
      const text = String(el.textContent || '').trim();
      if (UUID_RE.test(text)) el.textContent = '시설 정보';
    });
  }

  function updateVersionLabels() {
    const authVersion = document.querySelector('.auth-logo p');
    if (authVersion && authVersion.textContent !== 'v0.3.3 ADMIN CONTROL ONLINE') {
      authVersion.textContent = 'v0.3.3 ADMIN CONTROL ONLINE';
    }
    const sideVersion = document.querySelector('.sidebar .version');
    if (sideVersion && sideVersion.textContent !== 'FACILITY OPS v0.3.3 ONLINE') {
      sideVersion.textContent = 'FACILITY OPS v0.3.3 ONLINE';
    }
  }

  function refreshUi() {
    scheduled = false;
    updateVersionLabels();
    scrubInternalIds();
    applyAdminVisibility();
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refreshUi);
  }

  // 원래 테마 onclick보다 먼저 가로채서 회사 PC 저장소 제한과 무관하게 전환합니다.
  document.addEventListener('click', function (event) {
    const themeBtn = event.target.closest?.('#themeBtn');
    if (themeBtn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleThemeSafe();
      return;
    }

    const exportBtn = event.target.closest?.('#exportBtn');
    if (exportBtn && !isAdminUi()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      notify('관리자만 데이터를 내보낼 수 있습니다.');
      return;
    }

    const setupTab = event.target.closest?.('[data-auth-tab="setup"]');
    if (setupTab && (!isAdminUi() || !adminSettingsOpen)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  }, true);

  document.addEventListener('change', function (event) {
    if (event.target?.id === 'importInput' && !isAdminUi()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { event.target.value = ''; } catch (_) {}
      notify('관리자만 백업 데이터를 가져올 수 있습니다.');
    }
  }, true);

  // config.js는 본문 뒤에서 로드되므로 로그인 화면의 연결 설정부터 즉시 숨깁니다.
  hideSetupForLogin();

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const saved = safeGetTheme();
      if (saved === 'light' || saved === 'dark') applyThemeVisual(saved);
      else applyThemeVisual(document.body.classList.contains('light') ? 'light' : 'dark');

      refreshUi();

      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, 20);
  }, { once: true });
})();
