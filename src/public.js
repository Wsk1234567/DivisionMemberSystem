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
  const nav = byId('portal-nav');
  const workspaceBase = () => {
    if (demo) return 'admin.html';
    if (approvedUrl(config.adminUrl)) return config.adminUrl;
    return '';
  };
  function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function parsePortalPayload(raw) {
    try {
      const payload = JSON.parse(decodeBase64Url(raw));
      if (!payload || typeof payload !== 'object') return null;
      if (payload.exp && Number(payload.exp) < Date.now()) return null;
      return payload;
    } catch (error) {
      return null;
    }
  }
  function portalFromHash() {
    const hash = String(location.hash || '').replace(/^#/, '');
    if (hash.startsWith('portal=')) return parsePortalPayload(hash.slice('portal='.length));
    return null;
  }
  function clearHash() {
    try { history.replaceState({}, '', location.pathname + location.search); } catch (error) { location.hash = ''; }
  }
  function saveSession(payload) {
    try { sessionStorage.setItem('tccd-portal', JSON.stringify(payload)); } catch (error) { /* ignore */ }
  }
  function loadSession() {
    try {
      const raw = sessionStorage.getItem('tccd-portal');
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (payload && payload.exp && Number(payload.exp) < Date.now()) {
        sessionStorage.removeItem('tccd-portal');
        return null;
      }
      return payload;
    } catch (error) {
      return null;
    }
  }
  function clearSession() {
    try { sessionStorage.removeItem('tccd-portal'); } catch (error) { /* ignore */ }
    clearHash();
  }
  function portalLoginHref() {
    const base = workspaceBase();
    if (!base) return '#';
    return base + (base.includes('?') ? '&' : '?') + 'mode=portal';
  }
  function resolveAdminUrl(session) {
    const candidates = [];
    if (session && session.adminUrl) candidates.push(String(session.adminUrl));
    candidates.push(workspaceBase());
    for (const url of candidates) {
      if (!url) continue;
      if (demo) return url;
      if (approvedUrl(url)) return url;
    }
    return workspaceBase();
  }
  function workspaceHref(mode, session) {
    const base = resolveAdminUrl(session);
    if (!base) return '#';
    return base + (base.includes('?') ? '&' : '?') + 'mode=' + mode;
  }
  function packageHref(session, packageId) {
    const base = resolveAdminUrl(session);
    if (!base || !packageId) return '#';
    return base + (base.includes('?') ? '&' : '?') + 'mode=oc&package=' + encodeURIComponent(packageId);
  }
  function renderNavbar(session) {
    const find = '<a href="#member-search">Find Member</a>';
    if (!session) {
      nav.innerHTML = find
        + '<a class="portal-link treasurer" href="' + escape(workspaceHref('treasurer')) + '">Treasurer Work</a>'
        + '<a class="portal-link admin" href="' + escape(workspaceHref('admin')) + '">Admin Work</a>'
        + '<a id="login-link" class="button primary portal-login" href="' + escape(portalLoginHref()) + '">Login</a>';
      return;
    }
    const parts = [find];
    if (session.treasurer) parts.push('<a class="portal-link treasurer" href="' + escape(workspaceHref('treasurer', session)) + '">Treasurer Work</a>');
    if (session.admin || session.owner) parts.push('<a class="portal-link admin" href="' + escape(workspaceHref('admin', session)) + '">Admin Work</a>');
    (session.packages || []).forEach(pkg => {
      parts.push('<a class="portal-link package-link" href="' + escape(packageHref(session, pkg.id)) + '">' + escape(pkg.label) + '</a>');
    });
    parts.push('<span class="portal-email" title="Signed in">' + escape(session.email || '') + '</span>');
    parts.push('<button type="button" id="logout-link" class="button portal-login">Logout</button>');
    nav.innerHTML = parts.join('');
    const logout = byId('logout-link');
    if (logout) logout.addEventListener('click', () => {
      clearSession();
      renderNavbar(null);
    });
  }

  const fromHash = portalFromHash();
  if (fromHash) {
    saveSession(fromHash);
    clearHash();
    renderNavbar(fromHash);
  } else {
    renderNavbar(loadSession());
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
