/*
 * L'Établi : progrès de révision gardés dans ce navigateur (window.MemoProgres), pour l'aperçu enseignant·e et la
 * révision en classe entière (éditeur /memo/) et pour la page publique /a/<jeton>. Les élèves connecté·es ont leurs
 * progrès sur le serveur (espace élève, EtabliEleve.memo) : ce fichier ne les concerne pas.
 * Base IndexedDB « etabli-memo », magasin « progres » ; repli en mémoire si le stockage est indisponible
 * (navigation privée) : la révision marche, les progrès ne sont simplement pas gardés.
 *
 *   MemoProgres.cleDoc(docId, espace)  -> 'doc:<espace|perso>:<docId>' ; MemoProgres.clePublic(jeton) -> 'pub:<jeton>'
 *   MemoProgres.lire(cle)              -> Promise<{ etats: {}, jours: [], maj }>
 *   MemoProgres.ecrire(cle, { etats, jours }) -> Promise ; les états sont fusionnés avec ceux déjà gardés
 *                                         (deux onglets : la révision la plus récente l'emporte)
 *   MemoProgres.effacer(cle)           -> Promise
 *   MemoProgres.local()                -> true si les progrès sont vraiment gardés (IndexedDB disponible)
 */
(function (global) {
  'use strict';
  const NOM = 'etabli-memo';
  const MAGASIN = 'progres';
  const memoire = new Map();
  let db = null;
  let disponible = true;

  function ouvrir() {
    if (db) return db;
    db = new Promise((res) => {
      try {
        if (!global.indexedDB) { disponible = false; res(null); return; }
        const r = global.indexedDB.open(NOM, 1);
        r.onupgradeneeded = () => { const b = r.result; if (!b.objectStoreNames.contains(MAGASIN)) b.createObjectStore(MAGASIN, { keyPath: 'cle' }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => { disponible = false; res(null); };
        r.onblocked = () => { disponible = false; res(null); };
      } catch (e) { disponible = false; res(null); }
    });
    return db;
  }
  async function tx(mode, fn) {
    const b = await ouvrir();
    if (!b) return undefined;
    return new Promise((res) => {
      try {
        const t = b.transaction(MAGASIN, mode);
        let out;
        const r = fn(t.objectStore(MAGASIN));
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => { disponible = false; res(undefined); };
        t.onabort = () => { disponible = false; res(undefined); };
      } catch (e) { disponible = false; res(undefined); }
    });
  }
  const vide = () => ({ etats: {}, jours: [], maj: 0 });
  function propre(v) {
    if (!v || typeof v !== 'object') return vide();
    return { etats: v.etats && typeof v.etats === 'object' ? v.etats : {}, jours: Array.isArray(v.jours) ? v.jours.filter((j) => typeof j === 'string') : [], maj: Number(v.maj) || 0 };
  }

  async function lire(cle) {
    const v = await tx('readonly', (st) => st.get(cle));
    if (v) return propre(v);
    return propre(memoire.get(cle));
  }
  async function ecrire(cle, o) {
    o = o || {};
    const avant = await lire(cle);
    const F = global.MemoFSRS;
    const etats = F && F.fusionner ? F.fusionner(avant.etats, o.etats || {}) : Object.assign({}, avant.etats, o.etats || {});
    const jours = Array.from(new Set(avant.jours.concat(o.jours || []))).sort().slice(-400);
    const v = { cle, etats, jours, maj: Date.now() };
    memoire.set(cle, v);
    await tx('readwrite', (st) => st.put(v));
    return v;
  }
  async function effacer(cle) {
    memoire.delete(cle);
    await tx('readwrite', (st) => st.delete(cle));
  }

  global.MemoProgres = {
    cleDoc: (docId, espace) => 'doc:' + (espace || 'perso') + ':' + docId,
    clePublic: (jeton) => 'pub:' + jeton,
    lire, ecrire, effacer,
    local: () => disponible,
  };
})(typeof window !== 'undefined' ? window : globalThis);
