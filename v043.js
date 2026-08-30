// FACILITY OPS v0.4.3 — SECURITY FINAL
// Account state / strict admin UI / role-based idle logout / input guards / security events.
(function () {
  const VERSION = '0.4.3';
  const ADMIN_IDLE_MS = 20 * 60 * 1000;
  const USER_IDLE_MS = 30 * 60 * 1000;
  const STATUS_LABEL = {
    pending: '승인 대기',
    active: '정상',
    suspended: '일시 정지',
    disabled: '사용 중지'
  };

  let lastActivityAt = Date.now();
  let signingOut = false;
  let uiQueued = false;
  let userStatusLoading = false;
  let userStatusCacheAt = 0;
  let userStatusMap = new Map();
  let loginEventKey = '';

  function esc(v) {
    try {
      return typeof window.esc === 'function'
        ? window.esc(v ?? '')
        : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    } catch (_) {
      return String(v ?? '');
    }
  }

  function currentProfileSafe() {
    try { return currentProfile || null; } catch (_) { return null; }
  }

  function currentUserSafe() {
    try { return currentUser || null; } catch (_) { return null; }
  }

  function currentClientSafe() {
    try { return dbClient || null; } catch (_) { return null; }
  }

  function accountStatus(profile = currentProfileSafe()) {
    if (!profile) return 'pending';
    if (profile.account_status) return String(profile.account_status);
    return profile.approved === false ? 'pending' : 'active';
  }

  function isActive(profile = currentProfileSafe()) {
    return !!profile && profile.approved !== false && accountStatus(profile) === 'active';
  }

  function isStrictAdmin(profile = currentProfileSafe()) {
    return isActive(profile) && profile.role === 'admin';
  }

  function say(message) {
    try { if (typeof toast === 'function') { toast(message); return; } } catch (_) {}
    alert(message);
  }

  async function logSecurityEvent(eventType, details = {}) {
    const client = currentClientSafe();
    const user = currentUserSafe();
    if (!client || !user) return;
    try {
      const payload = Object.assign({
        page: location.pathname,
        version: VERSION
      }, details || {});
      const { error } = await client.rpc('facility_ops_log_security_event', {
        p_event_type: String(eventType || ''),
        p_details: payload
      });
      if (error && !/Could not find|PGRST202|does not exist|schema cache/i.test(String(error.message || error))) {
        console.warn('[FACILITY OPS v0.4.3 security event]', error);
      }
    } catch (err) {
      console.warn('[FACILITY OPS v0.4.3 security event]', err);
    }
  }

  function installSecurityHook() {
    const security = window.FACILITY_OPS_SECURITY = window.FACILITY_OPS_SECURITY || {};
    if (security.beforeDataLoad?.__facilityV043) return;

    const original = typeof security.beforeDataLoad === 'function' ? security.beforeDataLoad : null;
    const wrapped = async function (client, user) {
      if (original) {
        const ok = await original(client, user);
        if (!ok) return false;
      }

      const { data, error } = await client
        .from('profiles')
        .select('id,display_name,role,approved,account_status')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        if (/account_status/i.test(String(error.message || error))) {
          return true;
        }
        throw error;
      }

      const profile = data || null;
      const status = accountStatus(profile);
      if (!profile || profile.approved === false || status !== 'active') {
        try { await client.auth.signOut(); } catch (_) {}
        const message = status === 'suspended'
          ? '이 계정은 일시 정지되었습니다. 관리자에게 문의해 주세요.'
          : status === 'disabled'
            ? '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.'
            : '이 계정은 아직 관리자의 사용 승인을 받지 않았습니다.';
        const el = document.getElementById('loginError');
        if (el) el.textContent = message;
        return false;
      }

      const key = String(user.id) + ':' + String(user.last_sign_in_at || '');
      if (loginEventKey !== key) {
        loginEventKey = key;
        setTimeout(() => logSecurityEvent('login_success', {
          role: profile.role || 'member',
          account_status: status
        }), 0);
      }
      return true;
    };
    wrapped.__facilityV043 = true;
    security.beforeDataLoad = wrapped;
  }

  function applyStrictAdminUi() {
    const admin = isStrictAdmin();
    const controls = [
      document.getElementById('adminCenterBtnV04'),
      document.getElementById('securityTestBtnV042'),
      document.getElementById('exportBtn')
    ];
    controls.forEach(el => {
      if (!el) return;
      el.hidden = !admin;
      el.style.display = admin ? '' : 'none';
    });

    const importLabel = document.getElementById('importInput')?.closest('label');
    if (importLabel) {
      importLabel.hidden = !admin;
      importLabel.style.display = admin ? '' : 'none';
    }

    const addButton = document.getElementById('globalAddBtn');
    if (addButton && !isActive()) addButton.style.display = 'none';
  }

  function interceptPrivilegedUi() {
    if (document.documentElement.dataset.facilityV043Privileged === '1') return;
    document.documentElement.dataset.facilityV043Privileged = '1';

    document.addEventListener('click', event => {
      const privileged = event.target.closest?.('#adminCenterBtnV04,#securityTestBtnV042,#exportBtn');
      if (privileged && !isStrictAdmin()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        say('관리자 권한과 활성 계정 상태가 필요합니다.');
        return;
      }

      if (event.target.closest?.('#adminCenterBtnV04') && isStrictAdmin()) {
        setTimeout(() => logSecurityEvent('admin_center_open'), 0);
      }
    }, true);

    document.addEventListener('change', event => {
      if (event.target?.id === 'importInput' && !isStrictAdmin()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        try { event.target.value = ''; } catch (_) {}
        say('관리자만 백업 데이터를 가져올 수 있습니다.');
      }
    }, true);
  }

  function applyInputGuards() {
    const form = document.getElementById('modalForm');
    if (form) {
      const max = {
        name: 100,
        location: 100,
        category: 50,
        vendor: 100,
        inspector: 80,
        title: 200,
        note: 2000
      };
      Object.entries(max).forEach(([name, value]) => {
        const el = form.elements?.namedItem(name);
        if (el && 'maxLength' in el) el.maxLength = value;
      });

      const cost = form.elements?.namedItem('cost');
      if (cost) {
        cost.min = '0';
        cost.max = '1000000000';
        cost.step = '1';
      }
    }

    document.querySelectorAll('[data-v04-name]').forEach(el => {
      if ('maxLength' in el) el.maxLength = 80;
    });
  }

  function patchOpenModal() {
    try {
      if (typeof openModal !== 'function' || openModal.__facilityV043) return;
      const original = openModal;
      const replacement = function (...args) {
        const out = original(...args);
        requestAnimationFrame(applyInputGuards);
        return out;
      };
      replacement.__facilityV043 = true;
      openModal = replacement;
      try { window.openModal = replacement; } catch (_) {}
    } catch (err) {
      console.warn('[FACILITY OPS v0.4.3 modal guard]', err);
    }
  }

  function markActivity() {
    lastActivityAt = Date.now();
  }

  async function checkRoleIdleLogout() {
    const user = currentUserSafe();
    const client = currentClientSafe();
    if (!user || !client || signingOut) {
      lastActivityAt = Date.now();
      return;
    }
    const limit = isStrictAdmin() ? ADMIN_IDLE_MS : USER_IDLE_MS;
    if (Date.now() - lastActivityAt < limit) return;

    signingOut = true;
    try {
      await logSecurityEvent('idle_logout', {
        role: currentProfileSafe()?.role || 'unknown',
        idle_minutes: Math.round(limit / 60000)
      });
      await client.auth.signOut();
      const error = document.getElementById('loginError');
      if (error) error.textContent = `보안을 위해 ${Math.round(limit / 60000)}분 동안 사용하지 않아 자동 로그아웃되었습니다.`;
    } catch (err) {
      console.error('[FACILITY OPS v0.4.3 idle logout]', err);
    } finally {
      signingOut = false;
      lastActivityAt = Date.now();
    }
  }

  async function loadUserStatuses(force = false) {
    if (!isStrictAdmin() || userStatusLoading) return;
    if (!force && userStatusMap.size && Date.now() - userStatusCacheAt < 2500) return;

    const client = currentClientSafe();
    if (!client) return;
    userStatusLoading = true;
    try {
      const { data, error } = await client.rpc('facility_ops_admin_list_users_v043');
      if (error) throw error;
      userStatusMap = new Map((data || []).map(row => [String(row.id), row]));
      userStatusCacheAt = Date.now();
    } catch (err) {
      if (!/Could not find|PGRST202|does not exist|schema cache/i.test(String(err?.message || err))) {
        console.warn('[FACILITY OPS v0.4.3 user status]', err);
      }
      userStatusMap = new Map();
    } finally {
      userStatusLoading = false;
    }
  }

  async function enhanceUserManagement() {
    if (!isStrictAdmin()) return;
    const content = document.getElementById('adminCenterContentV04');
    const table = content?.querySelector('.v04-table');
    if (!table || !content.querySelector('[data-v04-user]')) return;

    await loadUserStatuses();
    if (!userStatusMap.size) return;

    const head = table.querySelector('[data-v041-head]');
    if (head) head.textContent = '계정 상태';

    table.querySelectorAll('[data-v04-user]').forEach(row => {
      const id = String(row.getAttribute('data-v04-user') || '');
      const info = userStatusMap.get(id);
      if (!info) return;

      let cell = row.querySelector('[data-v041-cell]');
      if (!cell) {
        cell = document.createElement('td');
        cell.dataset.v041Cell = '1';
        row.insertBefore(cell, row.lastElementChild);
      }
      if (cell.querySelector('[data-v043-status]')) return;

      const status = String(info.account_status || (info.approved ? 'active' : 'pending'));
      cell.innerHTML = `<select class="v041-approval" data-v043-status ${id === String(currentUserSafe()?.id || '') ? 'title="현재 관리자 계정은 정지할 수 없습니다."' : ''}>
        ${Object.entries(STATUS_LABEL).map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>`;
    });
  }

  async function saveUserV043(button) {
    if (!isStrictAdmin()) return;
    const row = button.closest('[data-v04-user]');
    const userId = row?.getAttribute('data-v04-user');
    const statusEl = row?.querySelector('[data-v043-status]');
    if (!row || !userId || !statusEl) return;

    const displayName = row.querySelector('[data-v04-name]')?.value?.trim() || '';
    const role = row.querySelector('[data-v04-role]')?.value || 'member';
    const status = statusEl.value || 'pending';

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = '저장 중';
    try {
      const { error } = await currentClientSafe().rpc('facility_ops_admin_update_profile_v043', {
        p_user_id: userId,
        p_display_name: displayName,
        p_role: role,
        p_account_status: status
      });
      if (error) throw error;
      userStatusCacheAt = 0;
      say('사용자 이름·권한·계정 상태를 저장했습니다.');
      try { await loadRemoteData(false); } catch (_) {}
      document.querySelector('[data-v04-tab="users"]')?.click();
    } catch (err) {
      alert('사용자 정보를 저장하지 못했습니다.\n\n' + (err?.message || err));
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function installUserSaveInterceptor() {
    if (document.documentElement.dataset.facilityV043UserSave === '1') return;
    document.documentElement.dataset.facilityV043UserSave = '1';
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-v04-save-user]');
      if (!button) return;
      const row = button.closest('[data-v04-user]');
      if (!row?.querySelector('[data-v043-status]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      saveUserV043(button);
    }, true);
  }

  async function loadSecurityEvents() {
    const content = document.getElementById('adminCenterContentV04');
    if (!content || !isStrictAdmin()) return;
    content.innerHTML = '<div class="v04-empty">보안 이벤트를 불러오는 중...</div>';

    try {
      const { data, error } = await currentClientSafe()
        .from('security_events')
        .select('id,event_type,actor_name,created_at,details')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = data || [];
      content.innerHTML = `
        <div class="v04-toolbar"><div><h3>보안 이벤트</h3><small>최근 ${rows.length}건 · 로그인·관리자 작업·자동 로그아웃 기록</small></div><span class="v04-pill">관리자 전용</span></div>
        <div class="v04-log-list">
          ${rows.length ? rows.map(row => `<div class="v04-log">
            <b>${esc(row.event_type || '-')}</b>
            <small>${esc(row.actor_name || '-')}</small>
            <span>${esc(JSON.stringify(row.details || {}))}</span>
            <time>${esc(new Date(row.created_at).toLocaleString('ko-KR'))}</time>
          </div>`).join('') : '<div class="v04-empty">보안 이벤트가 없습니다.</div>'}
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="v04-upgrade"><b>v0.4.3 DB 업데이트 필요</b><br>${esc(err?.message || err)}</div>`;
    }
  }

  function ensureSecurityEventsTab() {
    const root = document.getElementById('adminCenterV04');
    const tabs = root?.querySelector('.v04-admin-tabs');
    if (!tabs || !isStrictAdmin()) return;

    let button = tabs.querySelector('[data-v043-tab="security"]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'v04-tab';
      button.type = 'button';
      button.dataset.v043Tab = 'security';
      button.textContent = '보안 이벤트';
      tabs.appendChild(button);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        tabs.querySelectorAll('.v04-tab').forEach(x => x.classList.toggle('active', x === button));
        loadSecurityEvents();
        logSecurityEvent('security_events_view');
      });
    }

    root.querySelectorAll('[data-v04-tab]').forEach(old => {
      if (old.dataset.v043Bound) return;
      old.dataset.v043Bound = '1';
      old.addEventListener('click', () => button.classList.remove('active'));
    });
  }

  function patchBackupImportLogging() {
    try {
      if (typeof importParsedData !== 'function' || importParsedData.__facilityV043) return;
      const original = importParsedData;
      const replacement = async function (parsed) {
        const out = await original(parsed);
        await logSecurityEvent('backup_import', {
          facilities: parsed?.facilities?.length || 0,
          inspections: parsed?.inspections?.length || 0,
          issues: parsed?.issues?.length || 0,
          schedules: parsed?.schedules?.length || 0
        });
        return out;
      };
      replacement.__facilityV043 = true;
      importParsedData = replacement;
      try { window.importParsedData = replacement; } catch (_) {}
    } catch (err) {
      console.warn('[FACILITY OPS v0.4.3 backup logging]', err);
    }
  }

  function wrapButtonHandlers() {
    const logout = document.getElementById('logoutBtn');
    if (logout && !logout.dataset.v043Wrapped) {
      logout.dataset.v043Wrapped = '1';
      const original = logout.onclick;
      logout.onclick = async function (event) {
        await logSecurityEvent('logout');
        return original?.call(this, event);
      };
    }

    const exportButton = document.getElementById('exportBtn');
    if (exportButton && !exportButton.dataset.v043Wrapped) {
      exportButton.dataset.v043Wrapped = '1';
      const original = exportButton.onclick;
      exportButton.onclick = async function (event) {
        if (!isStrictAdmin()) return;
        await logSecurityEvent('backup_export');
        return original?.call(this, event);
      };
    }

    const securityButton = document.getElementById('securityTestBtnV042');
    if (securityButton && !securityButton.dataset.v043Wrapped) {
      securityButton.dataset.v043Wrapped = '1';
      const original = securityButton.onclick;
      securityButton.onclick = async function (event) {
        if (!isStrictAdmin()) return;
        await logSecurityEvent('security_test');
        return original?.call(this, event);
      };
    }
  }

  function injectStyles() {
    if (document.getElementById('facilityOpsV043Style')) return;
    const style = document.createElement('style');
    style.id = 'facilityOpsV043Style';
    style.textContent = `
      .sidebar .version{font-size:0!important}
      .sidebar .version::after{content:"FACILITY OPS v0.4.3 SECURITY FINAL"!important;font-size:10px!important}
      .auth-logo p{font-size:0!important}
      .auth-logo p::after{content:"v0.4.3 SECURITY FINAL"!important;font-size:11px!important}
      [data-v043-status]{min-width:112px}
    `;
    document.head.appendChild(style);
    document.title = 'FACILITY OPS';
  }

  function applyUi() {
    uiQueued = false;
    injectStyles();
    installSecurityHook();
    patchOpenModal();
    patchBackupImportLogging();
    applyStrictAdminUi();
    applyInputGuards();
    ensureSecurityEventsTab();
    enhanceUserManagement();
    wrapButtonHandlers();
  }

  function queueUi() {
    if (uiQueued) return;
    uiQueued = true;
    requestAnimationFrame(applyUi);
  }

  ['pointerdown','keydown','wheel','touchstart','scroll','mousemove'].forEach(name => {
    window.addEventListener(name, markActivity, { passive: true });
  });
  window.addEventListener('focus', markActivity);

  injectStyles();
  installSecurityHook();
  interceptPrivilegedUi();
  installUserSaveInterceptor();

  setTimeout(() => {
    applyUi();
    const observer = new MutationObserver(queueUi);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(checkRoleIdleLogout, 30 * 1000);
  }, 120);
})();
