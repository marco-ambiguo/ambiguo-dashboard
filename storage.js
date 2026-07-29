(function () {
  const KEY = 'ambiguo_dashboard_simplified_v3';
  const OLD_KEYS = ['ambiguo_dashboard_simplified_v2'];
  const API_URL = '/api/data';

  function now() {
    return new Date().toISOString();
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  const defaultState = {
    settings: {
      vatRate: 22,
      lowStockThreshold: 3,
      allowNegativeStock: false,
      currency: 'EUR'
    },
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
      if (typeof d.archived !== 'boolean') d.archived = false;
      if (!d.discountPreset) {
        const n = String(d.name || '').toLowerCase();
        d.discountPreset = n.includes('etica') ? '5' : (n.includes('sun') ? '5+6' : 'none');
      }
    });

    next.customers.forEach(c => {
      if (typeof c.archived !== 'boolean') c.archived = false;
    });

    next.wines.forEach(w => {
      if (typeof w.archived !== 'boolean') w.archived = false;
      if (!w.vatRate) w.vatRate = next.settings.vatRate;
      if (!w.discountPreset) w.discountPreset = 'none';
      if (w.resalePrice == null) w.resalePrice = 0;
      if (w.discount1 == null) w.discount1 = 0;
      if (w.discount2 == null) w.discount2 = 0;
      if (w.discount3 == null) w.discount3 = 0;
      w.quantity = Math.round(Number(w.quantity || 0));
    });

    next.orders.forEach((o, i) => {
      if (!o.code) o.code = `ORD-${String(i + 1).padStart(3, '0')}`;
      if (!o.discountPreset) o.discountPreset = 'none';
      if (!o.lines) o.lines = [];

      o.lines.forEach(l => {
        if (!l.discountPreset) l.discountPreset = 'none';
        if (l.resalePrice == null) l.resalePrice = 0;
        if (l.discount1 == null) l.discount1 = 0;
        if (l.discount2 == null) l.discount2 = 0;
        if (l.discount3 == null) l.discount3 = 0;
        l.quantity = Math.round(Number(l.quantity || 0));
      });
    });

    next.sales.forEach((s, i) => {
      if (!s.code) s.code = `CLI-${String(i + 1).padStart(3, '0')}`;
      if (!s.lines) s.lines = [];

      s.lines.forEach(l => {
        l.quantity = Math.round(Number(l.quantity || 0));
      });
    });

    next.movements.forEach(m => {
      m.quantityChange = Math.round(Number(m.quantityChange || 0));
    });

    return next;
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

    try {
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      console.error('Errore lettura dati locali', err);
      return clone(defaultState);
    }
  }

  function saveLocal(state) {
    localStorage.setItem(KEY, JSON.stringify(normalizeState(state)));
  }

  async function loadOnline() {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error || 'Errore caricamento dati online.');
    }

    return result.data;
  }

  async function saveOnline(state) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(normalizeState(state))
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error || 'Errore salvataggio dati online.');
    }

    return result;
  }

  function load() {
    const localState = loadLocal();

    loadOnline()
      .then(onlineState => {
        if (!onlineState) return;

        const normalizedOnline = normalizeState(onlineState);
        saveLocal(normalizedOnline);

        window.dispatchEvent(
          new CustomEvent('ambiguo:onlineLoaded', {
            detail: { state: normalizedOnline }
          })
        );
      })
      .catch(error => {
        console.warn('Database online non disponibile. Uso dati locali.', error);
      });

    return localState;
  }

  function save(state) {
    const normalized = normalizeState(state);

    saveLocal(normalized);

    saveOnline(normalized)
      .then(() => {
        window.dispatchEvent(
          new CustomEvent('ambiguo:onlineSaved', {
            detail: { savedAt: now() }
          })
        );
      })
      .catch(error => {
        console.warn('Salvataggio online fallito. Dati salvati solo in locale.', error);

        window.dispatchEvent(
          new CustomEvent('ambiguo:onlineSaveError', {
            detail: { error }
          })
        );
      });
  }

  function reset() {
    localStorage.removeItem(KEY);
    const empty = clone(defaultState);
    save(empty);
    return empty;
  }

  function exportJSON(state) {
    return JSON.stringify(
      {
        exportedAt: now(),
        version: 3,
        data: normalizeState(state)
      },
      null,
      2
    );
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    const next = normalizeState(parsed.data || parsed);

    if (!Array.isArray(next.wines) || !Array.isArray(next.distributors)) {
      throw new Error('Backup non valido.');
    }

    save(next);
    return next;
  }

  window.AmbiguoStorage = {
    load,
    save,
    reset,
    exportJSON,
    importJSON,
    uuid,
    now
  };
})();