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
  if (demo) adminLink.href = 'admin.html';
  else if (approvedUrl(config.adminUrl)) adminLink.href = config.adminUrl;
  else { adminLink.removeAttribute('href'); adminLink.setAttribute('aria-disabled', 'true'); adminLink.title = 'Administrator access is not configured yet.'; }
  byId('search-mode').addEventListener('change', () => { byId('query').placeholder = byId('search-mode').value === 'name' ? 'Enter a name' : 'Enter the complete SJAM ID'; });
  function fetchPublic() {
    if (demo) return fetch('demo-public.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Preview data could not be loaded.'); return response.json(); });
    if (!approvedUrl(config.publicApiUrl)) return Promise.reject(new Error('The member directory is not connected yet. Please contact the division administrator.'));
    return new Promise((resolve, reject) => {
      const callback = 'kpt_' + crypto.getRandomValues(new Uint32Array(2)).join('_');
      const script = document.createElement('script');
      const cleanup = () => { clearTimeout(timer); script.remove(); delete window[callback]; };
      const timer = setTimeout(() => { cleanup(); reject(new Error('The request timed out. Please try again.')); }, 30000);
      window[callback] = response => { cleanup(); if (response.ok) resolve(response.data); else reject(new Error(response.error || 'The directory is temporarily unavailable.')); };
      script.onerror = () => { cleanup(); reject(new Error('Unable to connect. Check your internet connection and retry.')); };
      script.src = config.publicApiUrl + '?callback=' + callback + '&t=' + Date.now();
      document.head.appendChild(script);
    });
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
