// ---------- Durable Storage (IndexedDB) ----------
const DB_NAME = 'scout-logger';
const DB_VER  = 1;
const STORES  = { players:'players', pitches:'pitches', events:'events' };

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      Object.values(STORES).forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'key' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet(store, key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGet(store, key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror   = () => reject(req.error);
  });
}

function storeForKey(k){
  if (k.startsWith('players_')) return STORES.players;
  if (k.startsWith('pitches_')) return STORES.pitches;
  if (k.startsWith('events_'))  return STORES.events;
  return STORES.events;
}

// Hybrid LS+IDB helpers
function loadJSON(k, fb){
  try{
    const cached = localStorage.getItem(k);
    if (cached != null) return JSON.parse(cached);
  }catch{}
  (async () => {
    try{
      const store = storeForKey(k);
      const val = await idbGet(store, k);
      if (val !== undefined) {
        localStorage.setItem(k, JSON.stringify(val));
        document.dispatchEvent(new CustomEvent('dataHydrated', { detail: { key: k }}));
      }
    }catch{}
  })();
  return fb;
}

function saveJSON(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  (async () => {
    try{
      const store = storeForKey(k);
      await idbSet(store, k, v);
    }catch{}
  })();
}

// UI refresh when hydration fills LS
document.addEventListener('dataHydrated', (e) => {
  const { key } = e.detail || {};
  if (!key) return;

  const s = (function(){ try { return JSON.parse(localStorage.getItem('session')) } catch { return null } })() || {};
  const user = s.username || 'guest';

  if (key === `events_${user}` && typeof window.renderEventsTable === 'function') {
    window.renderEventsTable();
  }

  if (typeof window.adminScoutSelect !== 'undefined' &&
      window.adminScoutSelect?.value &&
      key === `events_${window.adminScoutSelect.value}` &&
      typeof window.adminListEventsFor === 'function') {
    window.adminListEventsFor(window.adminScoutSelect.value);
  }

  if (key === `pitches_${user}`) {
    const newTab = document.querySelector('[data-tab="new"]');
    if (newTab) newTab.click();
  }
});
