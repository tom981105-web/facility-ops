// FACILITY OPS v0.4.1 — SECURITY CORE
// 세션/승인 UI / 본인·관리자 수정 / 관리자 백업 복원 / 30분 미사용 로그아웃
(function () {
  const LIST_BY_TYPE = { facility:'facilities', inspection:'inspections', issue:'issues', schedule:'schedules' };
  const EDIT_ATTRS = {
    facility:'data-edit-facility',
    inspection:'data-edit-inspection',
    issue:'data-edit-issue',
    schedule:'data-edit-schedule'
  };
  const IDLE_LIMIT = 30 * 60 * 1000;
  let lastActivityAt = Date.now();
  let idleSigningOut = false;
  let uiQueued = false;
  let approvalLoading = false;
  let approvalCacheAt = 0;
  let approvalUsers = new Map();

  function safeEsc(v) {
    try { return typeof esc === 'function' ? esc(v ?? '') : String(v ?? ''); }
    catch (_) { return String(v ?? ''); }
  }

  function say(message) {
    try { if (typeof toast === 'function') { toast(message); return; } } catch (_) {}
    alert(message);
  }

  function isAdmin() {
    try { return currentProfile?.role === 'admin' && currentProfile?.approved !== false; }
    catch (_) { return document.querySelector('#userChip small')?.textContent?.trim() === '관리자'; }
  }

  function isViewer() {
    try { return currentProfile?.role === 'viewer'; } catch (_) { return false; }
  }

  function uid() {
    try { return currentUser?.id || null; } catch (_) { return null; }
  }

  function findItem(type, id) {
    try {
      const list = state?.[LIST_BY_TYPE[type]] || [];
      return list.find(x => String(x.id) === String(id)) || null;
    } catch (_) { return null; }
  }

  function isApproved() {
    try {
      // v0.4.1 SQL 적용 전에는 approved 필드가 없으므로 기존 동작을 유지합니다.
      return currentProfile?.approved !== false;
    } catch (_) { return true; }
  }

  function canModify(type, id) {
    if (!isApproved() || isViewer()) return false;
    if (isAdmin()) return true;
    const item = findItem(type, id);
    return !!item && !!uid() && item.createdBy === uid();
  }

  function patchCanEdit() {
    try {
      if (typeof canEdit !== 'function' || canEdit.__facilityV041) return;
      const replacement = function () {
        if (!isApproved()) return false;
        try { return (currentProfile?.role || 'member') !== 'viewer'; }
        catch (_) { return false; }
      };
      replacement.__facilityV041 = true;
      canEdit = replacement;
      try { window.canEdit = replacement; } catch (_) {}
    } catch (err) { console.error('[v0.4.1 canEdit]', err); }
  }

  function patchOpenModal() {
    try {
      if (typeof openModal !== 'function' || openModal.__facilityV041) return;
      const original = openModal;
      const replacement = function(type, id=null, prefill={}) {
        if (!isApproved()) {
          say('승인된 계정만 데이터를 등록하거나 수정할 수 있습니다.');
          return;
        }
        if (id && !canModify(type, id)) {
          say('수정은 관리자 또는 이 항목을 등록한 본인만 할 수 있습니다.');
          return;
        }
        return original(type, id, prefill);
      };
      replacement.__facilityV041 = true;
      openModal = replacement;
      try { window.openModal = replacement; } catch (_) {}
    } catch (err) { console.error('[v0.4.1 openModal]', err); }
  }

  function patchBackupImport() {
    try {
      if (typeof importParsedData !== 'function' || importParsedData.__facilityV041) return;
      const replacement = async function(parsed) {
        if (!isAdmin()) throw new Error('관리자만 백업 데이터를 가져올 수 있습니다.');
        if (!parsed?.facilities || !parsed?.inspections || !parsed?.issues || !parsed?.schedules) {
          throw new Error('FACILITY OPS 백업 형식이 아닙니다.');
        }
        if (!dbClient) throw new Error('DB 연결이 없습니다.');

        const makeRows = (type, rows) => (rows || []).map(x => {
          const row = typeof stripUndefined === 'function' ? stripUndefined(toDbRow(type, x)) : toDbRow(type, x);
          // 서버가 결정해야 하는 보안 메타데이터는 전송하지 않습니다.
          delete row.created_by; delete row.created_at; delete row.updated_by; delete row.updated_at;
          delete row.deleted_at; delete row.deleted_by;
          return row;
        });

        const payload = {
          facilities: makeRows('facility', parsed.facilities),
          inspections: makeRows('inspection', parsed.inspections),
          issues: makeRows('issue', parsed.issues),
          schedules: makeRows('schedule', parsed.schedules)
        };

        try { if (typeof setSyncing === 'function') setSyncing(true); } catch (_) {}
        try {
          const { data, error } = await dbClient.rpc('facility_ops_admin_import_backup', { p_payload: payload });
          if (error) throw error;
          await loadRemoteData(false);
          const total = Object.values(data || {}).reduce((a,b) => a + Number(b || 0), 0);
          say(`관리자 백업 가져오기 완료 · ${total}건 반영`);
        } finally {
          try { if (typeof setSyncing === 'function') setSyncing(false); } catch (_) {}
        }
      };
      replacement.__facilityV041 = true;
      importParsedData = replacement;
      try { window.importParsedData = replacement; } catch (_) {}
    } catch (err) { console.error('[v0.4.1 import]', err); }
  }

  function applyEditVisibility() {
    for (const [type, attr] of Object.entries(EDIT_ATTRS)) {
      document.querySelectorAll('[' + attr + ']').forEach(btn => {
        const id = btn.getAttribute(attr);
        const allowed = canModify(type, id);
        btn.hidden = !allowed;
        btn.style.display = allowed ? '' : 'none';
        if (allowed && !isAdmin()) btn.title = '내가 등록한 항목 수정';
      });
    }

    document.querySelectorAll('[data-detail-edit]').forEach(btn => {
      const id = btn.getAttribute('data-detail-edit');
      const allowed = canModify('facility', id);
      btn.hidden = !allowed;
      btn.style.display = allowed ? '' : 'none';
    });

    document.querySelectorAll('[data-timeline-edit]').forEach(btn => {
      const type = btn.getAttribute('data-timeline-edit');
      const id = btn.getAttribute('data-item-id');
      const allowed = canModify(type, id);
      btn.hidden = !allowed;
      btn.style.display = allowed ? '' : 'none';
    });
  }

  async function enforceApproval() {
    try {
      if (!currentUser || !currentProfile || currentProfile.approved !== false || idleSigningOut) return;
      idleSigningOut = true;
      try { await dbClient?.auth?.signOut(); } catch (_) {}
      setTimeout(() => {
        const gate = document.getElementById('authGate');
        if (gate) gate.hidden = false;
        const error = document.getElementById('loginError');
        if (error) error.textContent = '이 계정은 아직 관리자의 사용 승인을 받지 않았습니다.';
        idleSigningOut = false;
      }, 50);
    } catch (_) { idleSigningOut = false; }
  }

  function patchLoadRemoteData() {
    try {
      if (typeof loadRemoteData !== 'function' || loadRemoteData.__facilityV041) return;
      const original = loadRemoteData;
      const replacement = async function(...args) {
        const out = await original(...args);
        patchCanEdit();
        await enforceApproval();
        queueUi();
        return out;
      };
      replacement.__facilityV041 = true;
      loadRemoteData = replacement;
      try { window.loadRemoteData = replacement; } catch (_) {}
    } catch (err) { console.error('[v0.4.1 loadRemoteData]', err); }
  }

  function injectStyles() {
    if (document.getElementById('facilityOpsV041Style')) return;
    const style = document.createElement('style');
    style.id = 'facilityOpsV041Style';
    style.textContent = `
      .sidebar .version{font-size:0!important}.sidebar .version::after{content:"FACILITY OPS v0.4.1 SECURITY CORE"!important;font-size:10px!important}
      .auth-logo p{font-size:0!important}.auth-logo p::after{content:"v0.4.1 SECURITY CORE"!important;font-size:11px!important}
      .v041-approval{min-height:34px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--text);padding:0 8px;min-width:94px}
      .v041-security-note{margin-bottom:12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line));border-radius:11px;background:color-mix(in srgb,var(--accent) 6%,var(--panel-2));font-size:10px;color:var(--soft)}
    `;
    document.head.appendChild(style);
  }

  async function loadApprovalUsers(force=false) {
    if (!isAdmin() || !dbClient || approvalLoading) return;
    if (!force && Date.now() - approvalCacheAt < 3000 && approvalUsers.size) return;
    approvalLoading = true;
    try {
      const { data, error } = await dbClient.rpc('facility_ops_admin_list_users_v041');
      if (error) throw error;
      approvalUsers = new Map((data || []).map(x => [String(x.id), x]));
      approvalCacheAt = Date.now();
    } catch (err) {
      // SQL 미적용 상태에서는 기존 v0.4 사용자 관리 화면을 그대로 둡니다.
      console.warn('[v0.4.1 approval list]', err);
      approvalUsers = new Map();
    } finally { approvalLoading = false; }
  }

  async function enhanceAdminUsers() {
    if (!isAdmin()) return;
    const content = document.getElementById('adminCenterContentV04');
    const table = content?.querySelector('.v04-table');
    if (!table || !content.querySelector('[data-v04-user]')) return;

    await loadApprovalUsers();
    if (!approvalUsers.size) return;

    if (!content.querySelector('.v041-security-note')) {
      const note = document.createElement('div');
      note.className = 'v041-security-note';
      note.textContent = 'SECURITY CORE · 승인 상태가 “승인”인 계정만 운영 DB에 접근할 수 있습니다.';
      content.insertBefore(note, content.querySelector('.v04-table-wrap'));
    }

    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('[data-v041-head]')) {
      const th = document.createElement('th');
      th.dataset.v041Head = '1';
      th.textContent = '사용 승인';
      headRow.insertBefore(th, headRow.lastElementChild);
    }

    table.querySelectorAll('[data-v04-user]').forEach(row => {
      if (row.querySelector('[data-v041-cell]')) return;
      const userId = row.getAttribute('data-v04-user');
      const info = approvalUsers.get(String(userId));
      if (!info) return;
      const td = document.createElement('td');
      td.dataset.v041Cell = '1';
      td.innerHTML = `<select class="v041-approval" data-v041-approved ${String(userId)===String(uid())?'title="현재 관리자 자신의 승인은 해제할 수 없습니다."':''}>
        <option value="true" ${info.approved?'selected':''}>승인</option>
        <option value="false" ${!info.approved?'selected':''}>미승인</option>
      </select>`;
      row.insertBefore(td, row.lastElementChild);
    });
  }

  async function saveUserV041(btn) {
    if (!isAdmin()) return;
    const userId = btn.getAttribute('data-v04-save-user');
    const row = btn.closest('[data-v04-user]');
    const approvedEl = row?.querySelector('[data-v041-approved]');
    if (!row || !approvedEl) return false;

    const displayName = row.querySelector('[data-v04-name]')?.value?.trim() || '';
    const role = row.querySelector('[data-v04-role]')?.value || 'member';
    const approved = approvedEl.value === 'true';
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '저장 중';
    try {
      const { error } = await dbClient.rpc('facility_ops_admin_update_profile_v041', {
        p_user_id: userId,
        p_display_name: displayName,
        p_role: role,
        p_approved: approved
      });
      if (error) throw error;
      approvalCacheAt = 0;
      say('사용자 이름·권한·승인 상태를 저장했습니다.');
      try { await loadRemoteData(false); } catch (_) {}
      return true;
    } catch (err) {
      alert('사용자 정보를 저장하지 못했습니다.\n\n' + (err?.message || err));
      return true;
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function markActivity() {
    lastActivityAt = Date.now();
  }

  async function checkIdleLogout() {
    try {
      if (!currentUser || idleSigningOut) { lastActivityAt = Date.now(); return; }
      if (Date.now() - lastActivityAt < IDLE_LIMIT) return;
      idleSigningOut = true;
      await dbClient?.auth?.signOut();
      setTimeout(() => {
        const error = document.getElementById('loginError');
        if (error) error.textContent = '보안을 위해 30분 동안 사용하지 않아 자동 로그아웃되었습니다.';
        idleSigningOut = false;
        lastActivityAt = Date.now();
      }, 80);
    } catch (err) {
      console.error('[v0.4.1 idle logout]', err);
      idleSigningOut = false;
      lastActivityAt = Date.now();
    }
  }

  function applyUi() {
    uiQueued = false;
    injectStyles();
    patchCanEdit();
    patchOpenModal();
    patchBackupImport();
    patchLoadRemoteData();
    applyEditVisibility();
    enhanceAdminUsers();
    enforceApproval();
  }

  function queueUi() {
    if (uiQueued) return;
    uiQueued = true;
    requestAnimationFrame(applyUi);
  }

  // 기존 v0.4 사용자 저장 버튼보다 먼저 SECURITY CORE 저장을 실행합니다.
  document.addEventListener('click', function(event) {
    const btn = event.target.closest?.('[data-v04-save-user]');
    if (btn && btn.closest('[data-v04-user]')?.querySelector('[data-v041-approved]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveUserV041(btn);
      return;
    }

    // 권한 없는 수정 버튼을 개발자도구로 다시 보이게 해도 실행을 차단합니다.
    const pairs = [
      ['data-edit-facility','facility'],
      ['data-edit-inspection','inspection'],
      ['data-edit-issue','issue'],
      ['data-edit-schedule','schedule'],
      ['data-detail-edit','facility']
    ];
    for (const [attr,type] of pairs) {
      const target = event.target.closest?.('[' + attr + ']');
      if (target && !canModify(type, target.getAttribute(attr))) {
        event.preventDefault(); event.stopImmediatePropagation();
        say('수정은 관리자 또는 이 항목을 등록한 본인만 할 수 있습니다.');
        return;
      }
    }
    const timeline = event.target.closest?.('[data-timeline-edit]');
    if (timeline && !canModify(timeline.getAttribute('data-timeline-edit'), timeline.getAttribute('data-item-id'))) {
      event.preventDefault(); event.stopImmediatePropagation();
      say('수정은 관리자 또는 이 항목을 등록한 본인만 할 수 있습니다.');
    }
  }, true);

  ['pointerdown','keydown','wheel','touchstart','scroll'].forEach(name => {
    window.addEventListener(name, markActivity, { passive:true });
  });
  window.addEventListener('focus', markActivity);

  injectStyles();
  setTimeout(() => {
    applyUi();
    const observer = new MutationObserver(queueUi);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    setInterval(checkIdleLogout, 30 * 1000);
  }, 100);
})();
