window.FACILITY_OPS_CONFIG = {
  supabaseUrl: "https://rmkjiqzcxbxwbiwqjjcz.supabase.co",
  supabaseKey: "sb_publishable_Vb2sf5s6hJbr0FuNVx1oxA_Epbqu3yV"
};

// FACILITY OPS v0.4 bootstrap
// 기존 v0.3 핫픽스를 하나로 정리하고 v04.js를 로드합니다.
(function () {
  const INTERNAL_LOGIN_DOMAIN = 'facility.local';
  const THEME_KEY = 'facility_ops_theme';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let volatileTheme = null;
  let adminSettingsOpen = false;
  let refreshQueued = false;

  function isAdminUi() {
    return document.querySelector('#userChip small')?.textContent?.trim() === '관리자';
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
    if (help) help.textContent = '관리자에게 발급받은 아이디와 비밀번호로 로그인하세요.';

    try {
      if (typeof loginWithPassword === 'function' && !loginWithPassword.__idLoginV04) {
        const original = loginWithPassword;
        const wrapped = async function(loginId, password) {
          const id = String(loginId || '').trim().toLowerCase();
          const errorEl = document.getElementById('loginError');
          if (!id) { if (errorEl) errorEl.textContent = '아이디를 입력해 주세요.'; return; }
          const email = id.includes('@') ? id : id + '@' + INTERNAL_LOGIN_DOMAIN;
          return original(email, password);
        };
        wrapped.__idLoginV04 = true;
        loginWithPassword = wrapped;
        try { window.loginWithPassword = wrapped; } catch (_) {}
      }
    } catch (_) {}
  }

  function attachConnectionTest() {
    const form = document.getElementById('setupForm');
    const btn = form?.querySelector('button');
    if (!btn || btn.dataset.v04ConnectionTest) return;
    btn.dataset.v04ConnectionTest = '1';
    btn.type = 'button';
    btn.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const status = document.getElementById('setupError');
      const cfg = {
        supabaseUrl: String(document.getElementById('setupUrl')?.value || '').trim(),
        supabaseKey: String(document.getElementById('setupKey')?.value || '').trim()
      };
      const old = btn.textContent;
      if (status) { status.classList.remove('success'); status.style.color='#f0b84b'; status.textContent='● Supabase 연결 확인 중...'; }
      btn.disabled = true; btn.textContent='연결 확인 중...';
      try {
        if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('Project URL과 Publishable Key를 모두 입력해 주세요.');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let res;
        try {
          res = await fetch(cfg.supabaseUrl.replace(/\/+$/,'') + '/auth/v1/settings', { headers:{apikey:cfg.supabaseKey}, cache:'no-store', signal:controller.signal });
        } finally { clearTimeout(timer); }
        if (!res.ok) throw new Error(res.status===401||res.status===403?'Publishable Key가 올바르지 않습니다.':'Supabase 응답 오류 (HTTP '+res.status+')');
        try { localStorage.setItem('facility_ops_supabase_config', JSON.stringify(cfg)); } catch (_) {}
        if (status) { status.classList.add('success'); status.style.color='#55d6ad'; status.textContent='✓ Supabase 연결 성공!'; }
        if (typeof bootConnection === 'function') await bootConnection(cfg, true);
      } catch (err) {
        if (status) {
          status.classList.remove('success'); status.style.color='#ff6b78';
          status.textContent = '✕ ' + (err?.name==='AbortError'?'연결 시간 초과':(err?.message||'연결 테스트 실패'));
        }
      } finally { btn.disabled=false; btn.textContent=old; }
    }, true);
  }

  function hideSetupTab() {
    const setupTab = document.querySelector('[data-auth-tab="setup"]');
    if (!setupTab) return;
    if (!adminSettingsOpen || !isAdminUi()) {
      setupTab.hidden = true;
      setupTab.style.display = 'none';
      const gate = document.getElementById('authGate');
      if (gate && !gate.hidden) {
        document.getElementById('authPane-setup')?.classList.remove('active');
        document.getElementById('authPane-login')?.classList.add('active');
        setupTab.classList.remove('active');
        document.querySelector('[data-auth-tab="login"]')?.classList.add('active');
      }
    }
  }

  function ensureAdminConnectionButton() {
    let btn = document.getElementById('adminConnectionBtnV04');
    if (!btn) {
      const logout = document.getElementById('logoutBtn');
      if (!logout) return null;
      btn = document.createElement('button');
      btn.id = 'adminConnectionBtnV04';
      btn.type = 'button';
      btn.className = 'ghost-btn full';
      btn.textContent = '연결 설정';
      btn.onclick = function () {
        if (!isAdminUi()) return;
        adminSettingsOpen = true;
        const gate = document.getElementById('authGate');
        const setupTab = document.querySelector('[data-auth-tab="setup"]');
        if (setupTab) { setupTab.hidden=false; setupTab.style.display=''; }
        if (gate) gate.hidden=false;
        try { setAuthTab('setup'); } catch (_) {}
        ensureSetupBackButton();
      };
      logout.parentNode.insertBefore(btn, logout);
    }
    btn.hidden = !isAdminUi();
    btn.style.display = isAdminUi() ? '' : 'none';
    return btn;
  }

  function ensureSetupBackButton() {
    let btn = document.getElementById('setupBackBtnV04');
    if (btn) return btn;
    const pane = document.getElementById('authPane-setup');
    if (!pane) return null;
    btn = document.createElement('button');
    btn.id = 'setupBackBtnV04';
    btn.type = 'button';
    btn.className = 'ghost-btn full';
    btn.style.marginTop='8px';
    btn.textContent='← 시스템으로 돌아가기';
    btn.onclick = function () {
      adminSettingsOpen=false;
      document.getElementById('authGate').hidden=true;
      hideSetupTab();
      try { setAuthTab('login'); } catch (_) {}
    };
    pane.appendChild(btn);
    return btn;
  }

  function applyAdminVisibility() {
    const admin = isAdminUi();
    const exportBtn = document.getElementById('exportBtn');
    const importLabel = document.getElementById('importInput')?.closest('label');
    if (exportBtn) { exportBtn.hidden=!admin; exportBtn.style.display=admin?'':'none'; }
    if (importLabel) { importLabel.hidden=!admin; importLabel.style.display=admin?'':'none'; }
    ensureAdminConnectionButton();
    hideSetupTab();
  }

  function scrubUuid() {
    document.querySelectorAll('.detail-code').forEach(el => {
      const t=String(el.textContent||'').trim();
      if (UUID_RE.test(t)) { el.textContent='▦'; el.title='시설'; }
    });
    document.querySelectorAll('.panel-title small').forEach(el => {
      if (UUID_RE.test(String(el.textContent||'').trim())) el.textContent='시설 정보';
    });
  }

  function refreshUi() {
    refreshQueued=false;
    patchIdLogin();
    attachConnectionTest();
    applyAdminVisibility();
    scrubUuid();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued=true;
    requestAnimationFrame(refreshUi);
  }

  document.addEventListener('click', function(event) {
    const theme = event.target.closest?.('#themeBtn');
    if (theme) {
      event.preventDefault(); event.stopImmediatePropagation();
      const next=document.body.classList.contains('light')?'dark':'light';
      safeSetTheme(next); applyThemeVisual(next); return;
    }
    if (event.target.closest?.('#exportBtn') && !isAdminUi()) {
      event.preventDefault(); event.stopImmediatePropagation(); notify('관리자만 데이터를 내보낼 수 있습니다.'); return;
    }
    if (event.target.closest?.('[data-auth-tab="setup"]') && (!isAdminUi() || !adminSettingsOpen)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('change', function(event) {
    if (event.target?.id==='importInput' && !isAdminUi()) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { event.target.value=''; } catch (_) {}
      notify('관리자만 백업 데이터를 가져올 수 있습니다.');
    }
  }, true);

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const saved=safeGetTheme();
      applyThemeVisual(saved==='light'||saved==='dark'?saved:(document.body.classList.contains('light')?'light':'dark'));
      refreshUi();
      const observer=new MutationObserver(queueRefresh);
      observer.observe(document.body,{childList:true,subtree:true,characterData:true});

      // v0.4 기능 본체는 메인 앱 초기화 이후 로드
      if (!document.getElementById('facilityOpsV04Script')) {
        const s=document.createElement('script');
        s.id='facilityOpsV04Script';
        s.src='v04.js?v=040';
        s.async=false;
        document.body.appendChild(s);
      }
    }, 30);
  }, {once:true});
})();
