// FACILITY OPS v0.4.0
// 사용자 관리 / 변경 이력 / 휴지통 / 본인 또는 관리자만 삭제
(function () {
  const TABLE_BY_TYPE = { facility:'facilities', inspection:'inspections', issue:'issues', schedule:'schedules' };
  const LIST_BY_TYPE = { facility:'facilities', inspection:'inspections', issue:'issues', schedule:'schedules' };
  const DELETE_ATTRS = {
    facility:'data-del-facility',
    inspection:'data-del-inspection',
    issue:'data-del-issue',
    schedule:'data-del-schedule'
  };
  const TABLE_LABELS = { facilities:'시설', inspections:'점검', issues:'고장·민원', schedules:'일정', profiles:'사용자' };
  const ACTION_LABELS = { create:'등록', update:'수정', delete:'휴지통 이동', restore:'복원', profile_update:'사용자 변경' };

  let v04Ready = null;
  let activeAdminTab = 'users';
  let uiRefreshQueued = false;
  let recentAuditLoading = false;
  let heartbeatTimer = null;

  function safeEsc(v) {
    try { return typeof esc === 'function' ? esc(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    catch (_) { return String(v ?? ''); }
  }

  function isAdmin() {
    try { if (currentProfile?.role === 'admin') return true; } catch (_) {}
    return document.querySelector('#userChip small')?.textContent?.trim() === '관리자';
  }

  function isViewer() {
    try { return currentProfile?.role === 'viewer'; } catch (_) { return false; }
  }

  function uid() {
    try { return currentUser?.id || null; } catch (_) { return null; }
  }

  function readyClient() {
    try { return !!dbClient && !!currentUser; } catch (_) { return false; }
  }

  function say(message) {
    try { if (typeof toast === 'function') { toast(message); return; } } catch (_) {}
    alert(message);
  }

  function errorText(err) {
    const text = String(err?.message || err || '알 수 없는 오류');
    if (/Could not find the function|schema cache|PGRST202|does not exist/i.test(text)) {
      return 'v0.4 데이터베이스 업데이트가 아직 적용되지 않았습니다. Supabase SQL Editor에서 supabase_v0.4_upgrade.sql을 실행해 주세요.';
    }
    return text;
  }

  function injectStyles() {
    if (document.getElementById('facilityOpsV04Style')) return;
    const style = document.createElement('style');
    style.id = 'facilityOpsV04Style';
    style.textContent = `
      .sidebar .version{font-size:0!important}.sidebar .version::after{content:"FACILITY OPS v0.4.0 ONLINE";font-size:10px}
      .auth-logo p{font-size:0!important}.auth-logo p::after{content:"v0.4.0 USER CONTROL ONLINE";font-size:11px}
      .v04-owner-note{display:inline-flex;align-items:center;gap:5px;margin-left:6px;padding:3px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:9px;background:var(--panel-2)}
      .v04-admin-overlay{position:fixed;inset:0;z-index:105;background:rgba(2,8,14,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:24px}
      .v04-admin-overlay[hidden]{display:none}
      .v04-admin-shell{width:min(1180px,96vw);height:min(780px,92vh);border:1px solid var(--line-strong);border-radius:22px;background:var(--panel);box-shadow:0 30px 100px rgba(0,0,0,.48);display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden}
      .v04-admin-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--line)}
      .v04-admin-head h2{margin:3px 0 0;font-size:21px}.v04-admin-head p{margin:5px 0 0;color:var(--muted);font-size:11px}
      .v04-admin-tabs{display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--panel-2)}
      .v04-tab{border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:10px;padding:9px 14px;font-weight:700;font-size:11px}
      .v04-tab.active{color:var(--text);border-color:color-mix(in srgb,var(--accent) 40%,var(--line));background:color-mix(in srgb,var(--accent) 8%,var(--panel))}
      .v04-admin-content{overflow:auto;padding:18px 20px 24px}
      .v04-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.v04-toolbar h3{margin:0;font-size:17px}.v04-toolbar small{color:var(--muted)}
      .v04-table-wrap{border:1px solid var(--line);border-radius:16px;overflow:auto;background:var(--panel-2)}
      .v04-table{width:100%;border-collapse:collapse;min-width:760px}.v04-table th{padding:11px 12px;text-align:left;font-size:10px;color:var(--muted);border-bottom:1px solid var(--line);letter-spacing:.06em}.v04-table td{padding:12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--soft);vertical-align:middle}.v04-table tr:last-child td{border-bottom:0}
      .v04-input,.v04-select{min-height:34px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--text);padding:0 9px;outline:none}.v04-input{width:170px}.v04-select{min-width:110px}
      .v04-pill{display:inline-flex;align-items:center;padding:4px 8px;border:1px solid var(--line);border-radius:999px;font-size:9px;color:var(--muted);background:var(--panel)}
      .v04-log-list{display:grid;gap:8px}.v04-log{display:grid;grid-template-columns:94px 120px 1fr auto;gap:12px;align-items:center;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2)}.v04-log b{color:var(--text);font-size:12px}.v04-log small{color:var(--muted);font-size:10px}.v04-log time{color:var(--muted);font-size:10px;white-space:nowrap}
      .v04-empty{padding:34px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
      .v04-upgrade{padding:14px 15px;border:1px solid color-mix(in srgb,var(--watch) 40%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--watch) 7%,var(--panel-2));color:var(--soft);line-height:1.55}
      .v04-dashboard-panel{grid-column:1/-1}
      .v04-dashboard-activity{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.v04-dashboard-activity .v04-log{grid-template-columns:1fr;gap:5px}
      @media(max-width:900px){.v04-admin-shell{height:94vh}.v04-log{grid-template-columns:1fr}.v04-dashboard-activity{grid-template-columns:1fr}.v04-admin-tabs{overflow:auto}.v04-input{width:140px}}
    `;
    document.head.appendChild(style);
  }

  function findItem(type, id) {
    try {
      const list = state?.[LIST_BY_TYPE[type]] || [];
      return list.find(x => String(x.id) === String(id)) || null;
    } catch (_) { return null; }
  }

  function canDelete(type, id) {
    if (isAdmin()) return true;
    if (isViewer()) return false;
    const item = findItem(type, id);
    return !!item && !!uid() && item.createdBy === uid();
  }

  function applyDeleteButtonVisibility() {
    for (const [type, attr] of Object.entries(DELETE_ATTRS)) {
      document.querySelectorAll('[' + attr + ']').forEach(btn => {
        const id = btn.getAttribute(attr);
        const allowed = canDelete(type, id);
        btn.hidden = !allowed;
        btn.style.display = allowed ? '' : 'none';
        if (allowed && !isAdmin()) btn.title = '내가 등록한 항목 삭제';
      });
    }
  }

  function patchDeleteFunction() {
    try {
      if (typeof deleteItem !== 'function' || deleteItem.__facilityV04) return;
      const replacement = async function(type, id) {
        if (!readyClient()) return;
        if (!canDelete(type, id)) {
          say('삭제는 관리자 또는 이 항목을 등록한 본인만 할 수 있습니다.');
          return;
        }
        if (!confirm('이 항목을 휴지통으로 이동할까요?\n관리자는 휴지통에서 복원할 수 있습니다.')) return;
        try { if (typeof setSyncing === 'function') setSyncing(true); } catch (_) {}
        try {
          const table = TABLE_BY_TYPE[type];
          if (!table) throw new Error('알 수 없는 데이터 종류입니다.');
          const { error } = await dbClient.rpc('facility_ops_soft_delete', { p_table: table, p_id: String(id) });
          if (error) throw error;
          try { if (type === 'facility' && currentFacilityId === id) currentFacilityId = null; } catch (_) {}
          await loadRemoteData(false);
          say('휴지통으로 이동했습니다.');
          if (isAdmin()) refreshAdminIfOpen();
        } catch (err) {
          console.error('[FACILITY OPS v0.4 delete]', err);
          alert('삭제하지 못했습니다.\n\n' + errorText(err));
        } finally {
          try { if (typeof setSyncing === 'function') setSyncing(false); } catch (_) {}
        }
      };
      replacement.__facilityV04 = true;
      deleteItem = replacement;
      try { window.deleteItem = replacement; } catch (_) {}
    } catch (err) { console.error('[FACILITY OPS v0.4 patchDelete]', err); }
  }

  function ensureAdminButton() {
    let btn = document.getElementById('adminCenterBtnV04');
    if (!btn) {
      const logout = document.getElementById('logoutBtn');
      if (!logout) return null;
      btn = document.createElement('button');
      btn.id = 'adminCenterBtnV04';
      btn.type = 'button';
      btn.className = 'ghost-btn full';
      btn.textContent = '사용자 · 변경이력 관리';
      btn.addEventListener('click', openAdminCenter);
      logout.parentNode.insertBefore(btn, logout);
    }
    const admin = isAdmin();
    btn.hidden = !admin;
    btn.style.display = admin ? '' : 'none';
    return btn;
  }

  function ensureAdminCenter() {
    let root = document.getElementById('adminCenterV04');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'adminCenterV04';
    root.className = 'v04-admin-overlay';
    root.hidden = true;
    root.innerHTML = `
      <div class="v04-admin-shell" role="dialog" aria-modal="true" aria-label="관리자 센터">
        <div class="v04-admin-head">
          <div><div class="eyebrow">FACILITY OPS / ADMIN CENTER</div><h2>사용자 · 변경이력 관리</h2><p>사용자 권한, 작업 기록, 휴지통을 관리합니다.</p></div>
          <button class="icon-btn" id="adminCenterCloseV04" type="button" aria-label="닫기">×</button>
        </div>
        <div class="v04-admin-tabs">
          <button class="v04-tab active" data-v04-tab="users" type="button">사용자 관리</button>
          <button class="v04-tab" data-v04-tab="logs" type="button">변경 이력</button>
          <button class="v04-tab" data-v04-tab="trash" type="button">휴지통</button>
        </div>
        <div class="v04-admin-content" id="adminCenterContentV04"></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#adminCenterCloseV04').onclick = closeAdminCenter;
    root.addEventListener('click', e => { if (e.target === root) closeAdminCenter(); });
    root.querySelectorAll('[data-v04-tab]').forEach(btn => btn.addEventListener('click', () => {
      activeAdminTab = btn.dataset.v04Tab;
      root.querySelectorAll('[data-v04-tab]').forEach(x => x.classList.toggle('active', x === btn));
      renderAdminTab();
    }));
    return root;
  }

  function openAdminCenter() {
    if (!isAdmin()) { say('관리자만 사용자·변경이력 관리에 접근할 수 있습니다.'); return; }
    const root = ensureAdminCenter();
    root.hidden = false;
    renderAdminTab();
  }

  function closeAdminCenter() {
    const root = document.getElementById('adminCenterV04');
    if (root) root.hidden = true;
  }

  function adminContent() { return document.getElementById('adminCenterContentV04'); }

  function upgradeMessage() {
    return `<div class="v04-upgrade"><b>v0.4 DB 업데이트 필요</b><br>Supabase SQL Editor에서 저장소의 <b>supabase_v0.4_upgrade.sql</b> 내용을 전체 실행한 뒤 새로고침해 주세요.</div>`;
  }

  async function renderAdminTab() {
    const content = adminContent();
    if (!content || !isAdmin()) return;
    content.innerHTML = '<div class="v04-empty">불러오는 중...</div>';
    if (activeAdminTab === 'users') await loadUsers();
    else if (activeAdminTab === 'logs') await loadLogs();
    else await loadTrash();
  }

  async function loadUsers() {
    const content = adminContent();
    try {
      const { data, error } = await dbClient.rpc('facility_ops_admin_list_users');
      if (error) throw error;
      v04Ready = true;
      const rows = data || [];
      content.innerHTML = `
        <div class="v04-toolbar"><div><h3>사용자 관리</h3><small>${rows.length}명 · 이름과 권한을 관리합니다.</small></div><span class="v04-pill">관리자 전용</span></div>
        <div class="v04-table-wrap"><table class="v04-table"><thead><tr><th>아이디</th><th>표시 이름</th><th>권한</th><th>최근 접속</th><th>가입일</th><th></th></tr></thead><tbody>
        ${rows.map(u => `<tr data-v04-user="${safeEsc(u.id)}">
          <td><b>${safeEsc(u.login_id || '-')}</b>${u.id===uid()?'<span class="v04-owner-note">현재 계정</span>':''}</td>
          <td><input class="v04-input" data-v04-name value="${safeEsc(u.display_name || '')}" /></td>
          <td><select class="v04-select" data-v04-role ${u.id===uid()?'title="현재 관리자 자신의 관리자 권한은 해제할 수 없습니다."':''}>
            <option value="admin" ${u.role==='admin'?'selected':''}>관리자</option>
            <option value="member" ${u.role==='member'?'selected':''}>일반 사용자</option>
            <option value="viewer" ${u.role==='viewer'?'selected':''}>열람 전용</option>
          </select></td>
          <td>${dateTimeText(u.last_seen)}</td><td>${dateTimeText(u.created_at)}</td>
          <td><button class="mini-btn" data-v04-save-user="${safeEsc(u.id)}">저장</button></td>
        </tr>`).join('') || '<tr><td colspan="6">사용자가 없습니다.</td></tr>'}
        </tbody></table></div>`;
      content.querySelectorAll('[data-v04-save-user]').forEach(btn => btn.onclick = () => saveUser(btn.dataset.v04SaveUser));
    } catch (err) {
      console.error(err);
      v04Ready = false;
      content.innerHTML = upgradeMessage() + `<div class="v04-empty" style="margin-top:10px">${safeEsc(errorText(err))}</div>`;
    }
  }

  function dateTimeText(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(+d)) return String(v);
    return d.toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  }

  async function saveUser(userId) {
    const row = adminContent()?.querySelector(`[data-v04-user="${CSS.escape(userId)}"]`);
    if (!row) return;
    const displayName = row.querySelector('[data-v04-name]')?.value?.trim() || '';
    const role = row.querySelector('[data-v04-role]')?.value || 'member';
    try {
      const { error } = await dbClient.rpc('facility_ops_admin_update_profile', { p_user_id:userId, p_display_name:displayName, p_role:role });
      if (error) throw error;
      say('사용자 정보를 저장했습니다.');
      await loadRemoteData(false);
      await loadUsers();
    } catch (err) { alert('사용자 정보를 저장하지 못했습니다.\n\n' + errorText(err)); }
  }

  function targetTitle(log) {
    const d = log?.details || {};
    const row = d.new || d.old || d;
    if (log.table_name === 'facilities') return row.name || '시설';
    if (log.table_name === 'issues' || log.table_name === 'schedules') return row.title || TABLE_LABELS[log.table_name];
    if (log.table_name === 'inspections') return `점검 ${row.date || ''}`.trim();
    if (log.table_name === 'profiles') return row.display_name || '사용자 권한';
    return TABLE_LABELS[log.table_name] || '항목';
  }

  async function fetchLogs(limit=120) {
    const { data, error } = await dbClient.from('audit_logs').select('id,table_name,record_id,action,actor_id,actor_name,created_at,details').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function loadLogs() {
    const content = adminContent();
    try {
      const rows = await fetchLogs(150);
      v04Ready = true;
      content.innerHTML = `
        <div class="v04-toolbar"><div><h3>변경 이력</h3><small>등록·수정·삭제·복원·권한 변경 기록입니다.</small></div><span class="v04-pill">최근 ${rows.length}건</span></div>
        <div class="v04-log-list">${rows.length ? rows.map(logHtml).join('') : '<div class="v04-empty">아직 기록이 없습니다.</div>'}</div>`;
    } catch (err) {
      v04Ready = false;
      content.innerHTML = upgradeMessage() + `<div class="v04-empty" style="margin-top:10px">${safeEsc(errorText(err))}</div>`;
    }
  }

  function logHtml(x) {
    return `<div class="v04-log"><span class="v04-pill">${safeEsc(ACTION_LABELS[x.action] || x.action)}</span><div><b>${safeEsc(x.actor_name || '사용자')}</b><small>${safeEsc(TABLE_LABELS[x.table_name] || x.table_name)}</small></div><div><b>${safeEsc(targetTitle(x))}</b><small>${safeEsc(x.record_id || '')}</small></div><time>${safeEsc(dateTimeText(x.created_at))}</time></div>`;
  }

  async function loadTrash() {
    const content = adminContent();
    try {
      const { data, error } = await dbClient.rpc('facility_ops_admin_list_trash');
      if (error) throw error;
      v04Ready = true;
      const rows = data || [];
      content.innerHTML = `
        <div class="v04-toolbar"><div><h3>휴지통</h3><small>삭제된 항목은 실제로 지워지지 않고 이곳에 보관됩니다.</small></div><span class="v04-pill">${rows.length}건</span></div>
        <div class="v04-table-wrap"><table class="v04-table"><thead><tr><th>종류</th><th>항목</th><th>삭제 시각</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><span class="v04-pill">${safeEsc(TABLE_LABELS[r.table_name] || r.table_name)}</span></td><td><b>${safeEsc(r.title || r.record_id)}</b></td><td>${safeEsc(dateTimeText(r.deleted_at))}</td><td><button class="mini-btn" data-v04-restore-table="${safeEsc(r.table_name)}" data-v04-restore-id="${safeEsc(r.record_id)}">복원</button></td></tr>`).join('') || '<tr><td colspan="4"><div class="v04-empty">휴지통이 비어 있습니다.</div></td></tr>'}
        </tbody></table></div>`;
      content.querySelectorAll('[data-v04-restore-id]').forEach(btn => btn.onclick = () => restoreItem(btn.dataset.v04RestoreTable, btn.dataset.v04RestoreId));
    } catch (err) {
      v04Ready = false;
      content.innerHTML = upgradeMessage() + `<div class="v04-empty" style="margin-top:10px">${safeEsc(errorText(err))}</div>`;
    }
  }

  async function restoreItem(table, id) {
    if (!confirm('이 항목을 휴지통에서 복원할까요?')) return;
    try {
      const { error } = await dbClient.rpc('facility_ops_admin_restore_record', { p_table:table, p_id:id });
      if (error) throw error;
      await loadRemoteData(false);
      say('항목을 복원했습니다.');
      await loadTrash();
    } catch (err) { alert('복원하지 못했습니다.\n\n' + errorText(err)); }
  }

  async function touchProfile() {
    if (!readyClient()) return;
    try {
      const { error } = await dbClient.rpc('facility_ops_touch_my_profile');
      if (error) throw error;
      v04Ready = true;
    } catch (err) {
      if (/Could not find the function|PGRST202|schema cache|does not exist/i.test(String(err?.message || err))) v04Ready = false;
    }
  }

  function scheduleHeartbeat() {
    clearInterval(heartbeatTimer);
    touchProfile();
    heartbeatTimer = setInterval(touchProfile, 5 * 60 * 1000);
  }

  async function renderDashboardStaffActivity() {
    if (!isAdmin() || !readyClient()) return;
    const grid = document.querySelector('#view-dashboard.active .dashboard-grid');
    if (!grid || document.getElementById('dashboardStaffActivityV04') || recentAuditLoading) return;
    const panel = document.createElement('div');
    panel.id = 'dashboardStaffActivityV04';
    panel.className = 'panel v04-dashboard-panel';
    panel.innerHTML = `<div class="panel-title"><div><div class="eyebrow">STAFF ACTIVITY</div><h3>최근 직원 활동</h3></div><small>관리자 전용</small></div><div class="v04-dashboard-activity"><div class="v04-empty" style="grid-column:1/-1">불러오는 중...</div></div>`;
    grid.appendChild(panel);
    recentAuditLoading = true;
    try {
      const rows = await fetchLogs(6);
      const box = panel.querySelector('.v04-dashboard-activity');
      if (!box) return;
      box.innerHTML = rows.length ? rows.map(x => `<div class="v04-log"><div><b>${safeEsc(x.actor_name || '사용자')} · ${safeEsc(ACTION_LABELS[x.action] || x.action)}</b><small>${safeEsc(targetTitle(x))} · ${safeEsc(TABLE_LABELS[x.table_name] || x.table_name)}</small><small>${safeEsc(dateTimeText(x.created_at))}</small></div></div>`).join('') : '<div class="v04-empty" style="grid-column:1/-1">아직 직원 활동 기록이 없습니다.</div>';
    } catch (err) {
      const box = panel.querySelector('.v04-dashboard-activity');
      if (box) box.innerHTML = `<div class="v04-upgrade" style="grid-column:1/-1">${safeEsc(errorText(err))}</div>`;
    } finally { recentAuditLoading = false; }
  }

  function refreshAdminIfOpen() {
    const root = document.getElementById('adminCenterV04');
    if (root && !root.hidden && isAdmin()) renderAdminTab();
  }

  function updateUi() {
    uiRefreshQueued = false;
    injectStyles();
    patchDeleteFunction();
    applyDeleteButtonVisibility();
    ensureAdminButton();
    ensureAdminCenter();
    renderDashboardStaffActivity();
  }

  function queueUi() {
    if (uiRefreshQueued) return;
    uiRefreshQueued = true;
    requestAnimationFrame(updateUi);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const root = document.getElementById('adminCenterV04');
      if (root && !root.hidden) closeAdminCenter();
    }
  });

  injectStyles();
  setTimeout(() => {
    updateUi();
    scheduleHeartbeat();
    const observer = new MutationObserver(queueUi);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  }, 120);
})();
