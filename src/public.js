(function () {
  'use strict';
  const config = window.KPT_CONFIG || {};
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const byId = id => document.getElementById(id);
  const approvedUrl = value => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(value || '');
  const demo = config.demo === true;
  byId('organization').textContent = config.organization || byId('organization').textContent;
  byId('region').textContent = config.region || byId('region').textContent;
  byId('demo-banner').hidden = !demo;
  const adminLink = byId('admin-link');
  const treasurerLink = byId('treasurer-link');
  const loginLink = byId('login-link');
  const nav = byId('portal-nav');
  const workspaceBase = () => {
    if (demo) return 'admin.html';
    if (approvedUrl(config.adminUrl)) return config.adminUrl;
    return '';
  };
  function bindWorkspaceLink(element, mode, disabledTitle) {
    const base = workspaceBase();
    if (base) {
      element.href = base + (base.includes('?') ? '&' : '?') + 'mode=' + mode;
      element.removeAttribute('aria-disabled');
      element.title = '';
    } else {
      element.removeAttribute('href');
      element.setAttribute('aria-disabled', 'true');
      element.title = disabledTitle;
    }
  }
  function sessionFromHash() {
    const hash = String(location.hash || '').replace(/^#/, '');
    if (!hash.startsWith('session=')) return '';
    try { return decodeURIComponent(hash.slice('session='.length)); } catch (error) { return ''; }
  }
  function clearSessionHash() {
    try { history.replaceState({}, '', location.pathname + location.search); } catch (error) { location.hash = ''; }
  }
  function saveSession(token) {
    try { sessionStorage.setItem('tccd-portal-session', token); } catch (error) { /* ignore */ }
  }
  function loadSession() {
    try { return sessionStorage.getItem('tccd-portal-session') || ''; } catch (error) { return ''; }
  }
  function clearSession() {
    try { sessionStorage.removeItem('tccd-portal-session'); } catch (error) { /* ignore */ }
    clearSessionHash();
  }
  async function fetchPortal(token) {
    const base = workspaceBase();
    if (!base) throw new Error('Sign-in is not configured yet.');
    const url = base + (base.includes('?') ? '&' : '?') + 'portalSession=' + encodeURIComponent(token);
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
    const payload = await response.json();
    if (!payload || !payload.ok) throw new Error((payload && payload.error) || 'Sign-in expired. Please login again.');
    return payload.data;
  }
  async function logoutPortal(token) {
    const base = workspaceBase();
    if (base && token) {
      try {
        await fetch(base + (base.includes('?') ? '&' : '?') + 'portalLogout=' + encodeURIComponent(token), { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
      } catch (error) { /* ignore */ }
    }
    clearSession();
    renderNavbar(null);
    window.location.reload();
  }
  function packageHref(adminUrl, packageId) {
    const base = adminUrl || workspaceBase();
    if (!base) return '#';
    return base + (base.includes('?') ? '&' : '?') + 'mode=oc&package=' + encodeURIComponent(packageId);
  }
  function renderNavbar(session) {
    const find = '<a href="#member-search">Find Member</a>';
    const login = '<a id="login-link" class="button primary portal-login" href="' + escape(portalLoginHref()) + '">Login</a>';
    if (!session) {
      nav.innerHTML = find + '<a id="treasurer-link" class="portal-link treasurer" href="' + escape(workspaceBase() ? workspaceBase() + '?mode=treasurer' : '#') + '">Treasurer Work</a><a id="admin-link" class="portal-link admin" href="' + escape(workspaceBase() ? workspaceBase() + '?mode=admin' : '#') + '">Admin Work</a>' + login;
      return;
    }
    const parts = [find];
    if (session.treasurer) parts.push('<a class="portal-link treasurer" href="' + escape((session.adminUrl || workspaceBase()) + '?mode=treasurer') + '">Treasurer Work</a>');
    if (session.admin || session.owner) parts.push('<a class="portal-link admin" href="' + escape((session.adminUrl || workspaceBase()) + '?mode=admin') + '">Admin Work</a>');
    (session.packages || []).forEach(pkg => {
      parts.push('<a class="portal-link package-link" href="' + escape(packageHref(session.adminUrl, pkg.id)) + '">' + escape(pkg.label) + '</a>');
    });
    parts.push('<a id="logout-link" class="button portal-login" href="#">Logout</a>');
    nav.innerHTML = parts.join('');
    const logout = byId('logout-link');
    if (logout) logout.addEventListener('click', event => {
      event.preventDefault();
      logoutPortal(loadSession());
    });
  }
  function portalLoginHref() {
    const base = workspaceBase();
    if (!base) return '#';
    return base + (base.includes('?') ? '&' : '?') + 'mode=portal';
  }
  bindWorkspaceLink(adminLink, 'admin', 'Admin access is not configured yet.');
  bindWorkspaceLink(treasurerLink, 'treasurer', 'Treasurer access is not configured yet.');
  if (loginLink) loginLink.href = portalLoginHref();

  const hashSession = sessionFromHash();
  if (hashSession) {
    saveSession(hashSession);
    clearSessionHash();
    fetchPortal(hashSession).then(session => {
      renderNavbar(session);
    }).catch(() => {
      clearSession();
      renderNavbar(null);
    });
  } else if (loadSession()) {
    fetchPortal(loadSession()).then(session => renderNavbar(session)).catch(() => {
      clearSession();
      renderNavbar(null);
    });
  }

  byId('search-mode').addEventListener('change', () => { byId('query').placeholder = byId('search-mode').value === 'name' ? 'Enter a name' : 'Enter the complete SJAM ID'; });
  function fetchPublic() {
    if (demo) return fetch('demo-public.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Preview data could not be loaded.'); return response.json(); });
    if (!approvedUrl(config.publicApiUrl)) return Promise.reject(new Error('The member directory is not connected yet. Please contact the division administrator.'));
    return fetch(config.publicApiUrl + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit', mode: 'cors' })
      .then(response => { if (!response.ok) throw new Error('The directory is temporarily unavailable.'); return response.json(); })
      .then(response => { if (response.ok) return response.data; throw new Error(response.error || 'The directory is temporarily unavailable.'); });
  }
  byId('search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const query = byId('query').value.trim().toLowerCase();
    if (!query) return;
    const mode = byId('search-mode').value;
    const button = byId('search-button');
    button.disabled = true;
    button.textContent = 'Searching…';
    byId('message').textContent = '';
    try {
      const payload = await fetchPublic();
      if (!payload || !Array.isArray(payload.members)) throw new Error('The directory returned an invalid response.');
      const members = payload.members.filter(member => mode === 'name' ? String(member.name).toLowerCase().includes(query) : String(member.sjamId).trim().toLowerCase() === query);
      byId('results-title').textContent = members.length + (members.length === 1 ? ' member found' : ' members found');
      byId('updated').textContent = payload.updatedAt ? 'Updated ' + new Date(payload.updatedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : '';
      byId('results').innerHTML = members.length ? members.map(member => '<article class="card member-card"><div class="member-heading"><div><h2>' + escape(member.name) + '</h2><small>SJAM ID · ' + escape(member.sjamId || 'Not assigned') + '</small></div><span class="pill ' + (['Active', 'Graduated', 'Withdrawn'].includes(member.status) ? member.status : '') + '">' + escape(member.status) + '</span></div>' + (member.awards.length ? member.awards.map(award => '<div class="award-item"><strong>' + escape(award.name) + '</strong><div class="award-meta"><span>' + escape(award.category) + '</span><span>' + escape(award.level) + '</span><time>' + escape(award.date) + '</time></div></div>').join('') : '<div class="award-item muted">No awards recorded yet.</div>') + '</article>').join('') : '<div class="card empty" style="grid-column:1/-1"><strong>No matching member</strong>Try another spelling or check the complete SJAM ID.</div>';
    } catch (error) {
      byId('message').className = 'message error';
      byId('message').textContent = error.message;
      byId('results-title').textContent = 'Member records';
      byId('updated').textContent = '';
      byId('results').innerHTML = '<div class="card empty" style="grid-column:1/-1"><strong>Search unavailable</strong>Please retry when the connection is available.</div>';
    } finally { button.disabled = false; button.textContent = 'Search members'; }
  });
})();
