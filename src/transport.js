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
  const memoryTokens = { sessionToken: '', idToken: '' };
  const DEPLOYMENT_ERROR = 'The admin service is not publicly reachable. Redeploy the Apps Script web app as Execute as Me / Anyone, then sign in again.';
  const AUTH_ERROR = /(?:sign[ -]?in required|login expired|please sign in again)/i;
  function apiUrl() {
    const config = readConfig();
    return config.adminUrl || config.apiUrl || '';
  }
  function getTokens() {
    let sessionToken = store.get('tccd-session-token') || memoryTokens.sessionToken || '';
    let idToken = store.get('tccd-id-token') || memoryTokens.idToken || '';
    if (typeof location !== 'undefined') {
      const hash = String(location.hash || '').replace(/^#/, '');
      if (hash.startsWith('session=')) {
        try {
          const raw = decodeURIComponent(hash.slice('session='.length));
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
    memoryTokens.sessionToken = sessionToken;
    memoryTokens.idToken = idToken;
    return { sessionToken, idToken };
  }
  function saveTokens(tokens) {
    if (tokens && tokens.sessionToken) {
      memoryTokens.sessionToken = String(tokens.sessionToken);
      store.set('tccd-session-token', memoryTokens.sessionToken);
    }
    if (tokens && tokens.idToken) {
      memoryTokens.idToken = String(tokens.idToken);
      store.set('tccd-id-token', memoryTokens.idToken);
    }
  }
  function clearTokens() {
    memoryTokens.sessionToken = '';
    memoryTokens.idToken = '';
    store.remove('tccd-session-token');
    store.remove('tccd-id-token');
    store.remove('tccd-portal');
  }
  function isGoogleAuthorisationPage(response, text) {
    const finalUrl = String(response && response.url || '');
    const contentType = String(response && response.headers && response.headers.get && response.headers.get('content-type') || '');
    return /accounts\.google\.com|\/signin\//i.test(finalUrl)
      || (/text\/html/i.test(contentType) && /Google Apps Script|accounts\.google\.com|Authorization needed/i.test(String(text || '')));
  }
  let bridgeFrame = null;
  let bridgeReady = false;
  let bridgeListenerInstalled = false;
  let bridgeWaiters = [];
  let callSeq = 0;
  const pending = new Map();
  function markBridgeReady() {
    if (bridgeReady) return;
    bridgeReady = true;
    const waiters = bridgeWaiters;
    bridgeWaiters = [];
    waiters.forEach(fn => fn());
  }
  function installBridgeListener() {
    if (bridgeListenerInstalled) return;
    bridgeListenerInstalled = true;
    window.addEventListener('message', event => {
      const data = event && event.data;
      if (!data) return;
      const origin = String(event.origin || '');
      if (!/^https:\/\/(script\.google\.com|[\w.-]+\.googleusercontent\.com)$/.test(origin)) return;
      if (data.kptBridgeReady) markBridgeReady();
      if (!data.kptBridge) return;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.result && data.result.ok) entry.resolve(data.result.data);
      else entry.reject(new Error((data.result && data.result.error) || 'Request failed.'));
    });
  }
  function ensureBridge() {
    return new Promise((resolve, reject) => {
      const base = apiUrl();
      if (!base) return reject(new Error('Admin API URL is not configured.'));
      if (typeof document === 'undefined') return reject(new Error('Bridge is not available.'));
      installBridgeListener();
      if (bridgeReady && bridgeFrame) return resolve(bridgeFrame);
      if (!bridgeFrame) {
        bridgeFrame = document.getElementById('kpt-bridge');
        if (!bridgeFrame) {
          bridgeFrame = document.createElement('iframe');
          bridgeFrame.id = 'kpt-bridge';
          bridgeFrame.title = 'TCCD API bridge';
          bridgeFrame.setAttribute('aria-hidden', 'true');
          bridgeFrame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;opacity:0';
          bridgeFrame.src = base + (base.includes('?') ? '&' : '?') + 'mode=bridge';
          document.body.appendChild(bridgeFrame);
        }
      }
      if (bridgeReady) return resolve(bridgeFrame);
      bridgeWaiters.push(() => resolve(bridgeFrame));
      setTimeout(() => {
        if (bridgeReady) resolve(bridgeFrame);
        else reject(new Error(DEPLOYMENT_ERROR));
      }, 8000);
    });
  }
  function bridgeCall(payload) {
    return ensureBridge().then(frame => new Promise((resolve, reject) => {
      const id = 'kpt-' + (++callSeq);
      pending.set(id, { resolve, reject });
      const send = () => {
        try { frame.contentWindow.postMessage({ kptBridge: true, id, payload }, '*'); }
        catch (error) {
          pending.delete(id);
          reject(new Error('Could not post to the admin API bridge.'));
        }
      };
      send();
      // Retry once shortly in case the bridge script was not ready yet.
      setTimeout(send, 400);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(DEPLOYMENT_ERROR));
        }
      }, 10000);
    }));
  }
  async function getApi(body, base) {
    const encoded = encodeURIComponent(JSON.stringify(body));
    if (encoded.length >= 7000) throw new Error('Use the bridge for large requests.');
    const response = await fetch(base + (base.includes('?') ? '&' : '?') + 'api=1&payload=' + encoded, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store'
    });
    const text = await response.text();
    if (isGoogleAuthorisationPage(response, text)) throw new Error(DEPLOYMENT_ERROR);
    let payload;
    try { payload = JSON.parse(text); } catch (error) {
      throw new Error(/<!doctype|<html/i.test(text) ? DEPLOYMENT_ERROR : 'The admin API returned an unexpected response.');
    }
    if (!payload || payload.ok === false) throw new Error((payload && payload.error) || 'Request failed.');
    return payload.data;
  }
  async function postApi(body, base) {
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store'
    });
    const text = await response.text();
    if (isGoogleAuthorisationPage(response, text)) throw new Error(DEPLOYMENT_ERROR);
    let payload;
    try { payload = JSON.parse(text); } catch (error) {
      throw new Error(/<!doctype|<html/i.test(text) ? DEPLOYMENT_ERROR : 'The admin API returned an unexpected response.');
    }
    if (!payload || payload.ok === false) throw new Error((payload && payload.error) || 'Request failed.');
    return payload.data;
  }
  async function callApi(request, retried) {
    const tokens = getTokens();
    const body = Object.assign({}, request, {
      sessionToken: request.sessionToken || tokens.sessionToken || '',
      idToken: request.idToken || tokens.idToken || ''
    });
    const base = apiUrl();
    if (!base) throw new Error('Admin API URL is not configured.');
    return postApi(body, base).catch(async error => {
      const message = String(error && error.message || error);
      if (AUTH_ERROR.test(message) && !retried && request.action !== 'portalLogin' && tokens.idToken) {
        memoryTokens.sessionToken = '';
        store.remove('tccd-session-token');
        try {
          const login = await postApi({ action: 'portalLogin', idToken: tokens.idToken }, base);
          if (login && login.sessionToken) {
            saveTokens({ sessionToken: login.sessionToken, idToken: tokens.idToken });
            return callApi(request, true);
          }
        } catch (loginError) {
          const loginMessage = String(loginError && loginError.message || loginError);
          if (!AUTH_ERROR.test(loginMessage) && !/Google sign-in failed/i.test(loginMessage)) throw new Error(loginMessage);
        }
      }
      if (AUTH_ERROR.test(message) || /Google sign-in failed/i.test(message)) clearTokens();
      throw new Error(message);
    });
  }
  root.KPTTransport = {
    demo: false,
    publicUrl: readConfig().publicSiteUrl || '',
    getTokens,
    saveTokens,
    clearTokens,
    async loginWithIdToken(idToken) {
      const data = await callApi({ action: 'portalLogin', idToken });
      if (data && data.sessionToken) saveTokens({ sessionToken: data.sessionToken, idToken });
      return data;
    },
    async logout() {
      const tokens = getTokens();
      try {
        if (tokens.sessionToken) await callApi({ action: 'portalLogout', sessionToken: tokens.sessionToken });
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
      return callApi(request);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
