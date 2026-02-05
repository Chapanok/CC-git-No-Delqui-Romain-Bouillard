// /js/auth.js
(() => {
  const DEFAULT_API = 'https://api.flipiqapp.com';
  const base = (typeof window !== 'undefined' && window.API_BASE) || DEFAULT_API;
  const API = base.replace(/\/$/, '');
  const buildUrl = (path) => `${API}${path.startsWith('/') ? path : `/${path}`}`;


  async function api(path, body, method='POST') {
    try {
      const r = await fetch(buildUrl(path), {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(()=> ({}));
      return r.ok ? { ok:true, ...data } : { ok:false, ...data };
    } catch(e) { return { ok:false, error:'réseau' }; }
  }
  async function me() {
    const r = await fetch(buildUrl('/api/auth/me'), { credentials:'include' });
    return r.ok ? (await r.json()) : null;
  }
  async function logout() {
    await api('/api/auth/logout', null);
    location.reload();
  }
  // header state
  document.addEventListener('DOMContentLoaded', async ()=>{
    const ifAuth = document.getElementById('if-auth');
    const ifNotAuth = document.getElementById('if-not-auth');
    const m = await me();
    if (m && m.user) {
      if (ifAuth) ifAuth.style.display = '';
      if (ifNotAuth) ifNotAuth.style.display = 'none';
      const btn = document.getElementById('logoutBtn');
      if (btn) btn.addEventListener('click', logout);
    }
  });
  window.Auth = { api, me };
})();
