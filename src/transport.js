(function (root) {
  'use strict';
  function readConfig() {
    return root.KPT_CONFIG || {};
  }
  function sessionStore() {
    try {
      return {
        get(key) { return sessionStorage.getItem(key); },
        set(key, value) { sessionStorage.setItem(key, value); },
        remove(key) { sessionStorage.removeItem(key); }
      };
    } catch (error) {
      const memory = {};
      return {
        get(key) { return memory[key] || null; },
        set(key, value) { memory[key] = value; },
        remove(key) { delete memory[key]; }
      };
    }
  }
  const store = sessionStore();
  function apiUrl() {
    const config = readConfig();
    return config.adminUrl || config.apiUrl || '';
  }
  function getTokens() {
    let sessionToken = store.get('tccd-session-token') || '';
    let idToken = store.get('tccd-id-token') || '';
    if (typeof location !== 'undefined') {
      const hash = String(location.hash || '').replace(/^#/, '');
      if (hash.startsWith('session=')) {
        try {
          const raw = decodeURIComponent(hash.slice('session='.length));
          // Accept either a bare token or base64url JSON { token, idToken }
          if (raw.indexOf('{') === 0) {
            const payload = JSON.parse(raw);
            if (payload.token) sessionToken = String(payload.token);
            if (payload.idToken) idToken = String(payload.idToken);
          } else if (raw.length > 10) {
            sessionToken = raw;
          }
          if (sessionToken) store.set('tccd-session-token', sessionToken);
          if (idToken) store.set('tccd-id-token', idToken);
        } catch (error) { /* ignore */ }
        try { history.replaceState({}, '', location.pathname + location.search); } catch (error) { location.hash = ''; }
      }
    }
    return { sessionToken, idToken };
  }
  function saveTokens(tokens) {
    if (tokens && tokens.sessionToken) store.set('tccd-session-token', String(tokens.sessionToken));
    if (tokens && tokens.idToken) store.set('tccd-id-token', String(tokens.idToken));
  }
  function clearTokens() {
    store.remove('tccd-session-token');
    store.remove('tccd-id-token');
    store.remove('tccd-portal');
  }
  async function fetchApi(request) {
    const base = apiUrl();
    if (!base) throw new Error('Admin API URL is not configured.');
    const tokens = getTokens();
    const body = Object.assign({}, request, {
      sessionToken: request.sessionToken || tokens.sessionToken || '',
      idToken: request.idToken || tokens.idToken || ''
    });
    // text/plain avoids CORS preflight; Apps Script redirects then returns JSON.
    const response = await fetch(base + (base.includes('?') ? '&' : '?') + 'api=1', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store'
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch (error) {
      throw new Error('The admin API returned an unexpected response.');
    }
    if (!payload || payload.ok === false) throw new Error((payload && payload.error) || 'Request failed.');
    return payload.data;
  }
  window.KPTTransport = {
    demo: false,
    publicUrl: readConfig().publicSiteUrl || '',
    getTokens,
    saveTokens,
    clearTokens,
    async loginWithIdToken(idToken) {
      const data = await fetchApi({ action: 'portalLogin', idToken });
      if (data && data.sessionToken) saveTokens({ sessionToken: data.sessionToken, idToken });
      return data;
    },
    async logout() {
      const tokens = getTokens();
      try {
        if (tokens.sessionToken && apiUrl()) {
          await fetch(apiUrl() + (apiUrl().includes('?') ? '&' : '?') + 'api=1', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'portalLogout', sessionToken: tokens.sessionToken }),
            credentials: 'omit',
            redirect: 'follow'
          });
        }
      } catch (error) { /* ignore */ }
      clearTokens();
    },
    async call(request) {
      if (root.google && root.google.script && root.google.script.run && !apiUrl()) {
        return new Promise((resolve, reject) => {
          root.google.script.run.withSuccessHandler(response => {
            if (!response || !response.ok) reject(new Error(response && response.error || 'The server returned an invalid response.'));
            else resolve(response.data);
          }).withFailureHandler(() => reject(new Error('Unable to reach the Google service. Check your connection and retry.'))).rpc(request);
        });
      }
      return fetchApi(request);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
