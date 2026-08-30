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
