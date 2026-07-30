(function () {
  const KEY = 'ambiguo_dashboard_simplified_v3';
  const OLD_KEYS = ['ambiguo_dashboard_simplified_v2'];
  const API_URL = '/api/data';

  function now() { return new Date().toISOString(); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  const defaultState = {
    settings: { vatRate: 22, lowStockThreshold: 3, allowNegativeStock: false, currency: 'EUR' },
    distributors: [
      { id: uuid(), name: 'Etica Distribuzione', discountPreset: '5', archived: false, notes: '', createdAt: now() },
      { id: uuid(), name: 'Sun Import', discountPreset: '5+6', archived: false, notes: '', createdAt: now() },
      { id: uuid(), name: 'Triple A', discountPreset: 'none', archived: false, notes: '', createdAt: now() },
      { id: uuid(), name: 'Natives', discountPreset: 'none', archived: false, notes: '', createdAt: now() }
    ],
    customers: [],
    wines: [],
    orders: [],
    sales: [],
    movements: []
  };

  function normalizeState(parsed) {
    const base = clone(defaultState);
    const next = {
      ...base,
      ...(parsed || {}),
      settings: { ...base.settings, ...((parsed && parsed.settings) || {}) },
      distributors: Array.isArray(parsed?.distributors) ? parsed.distributors : base.distributors,
      customers: Array.isArray(parsed?.customers) ? parsed.customers : [],
      wines: Array.isArray(parsed?.wines) ? parsed.wines : [],
      orders: Array.isArray(parsed?.orders) ? parsed.orders : [],
      sales: Array.isArray(parsed?.sales) ? parsed.sales : [],
      movements: Array.isArray(parsed?.movements) ? parsed.movements : []
    };

    next.distributors.forEach(d => {
      if (!d.id) d.id = uuid();
      if (typeof d.archived !== 'boolean') d.archived = false;
      if (!d.discountPreset) {
        const n = String(d.name || '').toLowerCase();
        d.discountPreset = n.includes('etica') ? '5' : (n.includes('sun') ? '5+6' : 'none');
      }
    });

    next.customers.forEach(c => {
      if (!c.id) c.id = uuid();
      if (typeof c.archived !== 'boolean') c.archived = false;
    });

    next.orders.forEach((o, i) => {
      if (!o.id) o.id = uuid();
      if (!o.code) o.code = `ORD-${String(i + 1).padStart(3, '0')}`;
      if (!o.discountPreset) o.discountPreset = 'none';
      if (!o.paymentStatus) o.paymentStatus = 'da pagare';
      if (!Array.isArray(o.lines)) o.lines = [];
      o.lines.forEach(l => {
        if (!l.id) l.id = uuid();
        if (!l.discountPreset) l.discountPreset = 'none';
        if (l.resalePrice == null) l.resalePrice = 0;
        if (l.discount1 == null) l.discount1 = 0;
        if (l.discount2 == null) l.discount2 = 0;
        if (l.discount3 == null) l.discount3 = 0;
        l.quantity = Math.round(Number(l.quantity || 0));
      });
    });

    next.wines.forEach(w => {
      if (!w.id) w.id = uuid();
      if (typeof w.archived !== 'boolean') w.archived = false;
      if (!w.vatRate) w.vatRate = next.settings.vatRate;
      if (!w.discountPreset) w.discountPreset = 'none';
      if (w.resalePrice == null) w.resalePrice = 0;
      if (w.discount1 == null) w.discount1 = 0;
      if (w.discount2 == null) w.discount2 = 0;
      if (w.discount3 == null) w.discount3 = 0;
      w.quantity = Math.round(Number(w.quantity || 0));
      if (!w.lastOrderDate && w.sourceOrderId) {
        const order = next.orders.find(o => o.id === w.sourceOrderId);
        if (order?.date) w.lastOrderDate = order.date;
      }
    });

    next.sales.forEach((s, i) => {
      if (!s.id) s.id = uuid();
      if (!s.code) s.code = `CLI-${String(i + 1).padStart(3, '0')}`;
      if (!Array.isArray(s.lines)) s.lines = [];
      s.lines.forEach(l => { l.quantity = Math.round(Number(l.quantity || 0)); });
    });

    next.movements.forEach(m => {
      if (!m.id) m.id = uuid();
      m.quantityChange = Math.round(Number(m.quantityChange || 0));
    });

    return next;
  }

  function isMeaningfulState(state) {
    return Boolean(
      state && (
        (Array.isArray(state.wines) && state.wines.length) ||
        (Array.isArray(state.orders) && state.orders.length) ||
        (Array.isArray(state.sales) && state.sales.length) ||
        (Array.isArray(state.customers) && state.customers.length)
      )
    );
  }

  function loadLocal() {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const oldKey of OLD_KEYS) {
        raw = localStorage.getItem(oldKey);
        if (raw) break;
      }
    }
    if (!raw) return clone(defaultState);
    try { return normalizeState(JSON.parse(raw)); }
    catch (err) { console.error('Errore lettura dati locali', err); return clone(defaultState); }
  }

  function saveLocal(state) {
    const normalized = normalizeState(state);
    localStorage.setItem(KEY, JSON.stringify(normalized));
    return normalized;
  }

  async function loadOnline() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Errore caricamento cloud.');
    return result.data ? normalizeState(result.data) : null;
  }

  async function saveOnline(state) {
    const normalized = normalizeState(state);
    const response = await fetch(API_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(normalized)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Errore salvataggio cloud.');
    return result;
  }

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function load() {
    const localState = loadLocal();

    loadOnline()
      .then(onlineState => {
        if (onlineState && isMeaningfulState(onlineState)) {
          saveLocal(onlineState);
          dispatch('ambiguo:onlineLoaded', { state: onlineState, source: 'cloud' });
          return;
        }

        // Se il cloud è vuoto ma questo browser ha dati veri, li carichiamo subito online.
        if (isMeaningfulState(localState)) {
          saveOnline(localState)
            .then(() => dispatch('ambiguo:onlineSaved', { savedAt: now(), repairedEmptyCloud: true }))
            .catch(error => dispatch('ambiguo:onlineSaveError', { error }));
        }
      })
      .catch(error => dispatch('ambiguo:onlineLoadError', { error }));

    return localState;
  }

  function save(state) {
    const normalized = saveLocal(state);
    saveOnline(normalized)
      .then(() => dispatch('ambiguo:onlineSaved', { savedAt: now() }))
      .catch(error => dispatch('ambiguo:onlineSaveError', { error }));
  }

  async function refreshOnline() {
    const onlineState = await loadOnline();
    if (onlineState && isMeaningfulState(onlineState)) {
      saveLocal(onlineState);
      dispatch('ambiguo:onlineLoaded', { state: onlineState, source: 'manual-refresh' });
      return onlineState;
    }
    throw new Error('Nessun dato cloud trovato.');
  }

  async function forceUpload(state) {
    const normalized = saveLocal(state);
    await saveOnline(normalized);
    dispatch('ambiguo:onlineSaved', { savedAt: now(), forced: true });
    return normalized;
  }

  function reset() {
    localStorage.removeItem(KEY);
    const empty = clone(defaultState);
    save(empty);
    return empty;
  }

  function exportJSON(state) { return JSON.stringify({ exportedAt: now(), version: 4, data: normalizeState(state) }, null, 2); }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    const next = normalizeState(parsed.data || parsed);
    if (!Array.isArray(next.wines) || !Array.isArray(next.distributors)) throw new Error('Backup non valido.');
    save(next);
    return next;
  }

  window.AmbiguoStorage = { load, save, reset, exportJSON, importJSON, uuid, now, refreshOnline, forceUpload, loadOnline, saveOnline };
})();
