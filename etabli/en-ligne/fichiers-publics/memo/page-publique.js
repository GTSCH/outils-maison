/*
 * L'Établi : page publique de révision d'un paquet de cartes mémoire (/a/<jeton>, public/p/memo.html).
 * Sans compte ni cookie. Données : EtabliPublic.partage(jeton) -> { genre: 'memo', titre, maj, data: { description,
 * langues, cartes, reglages } }. Révision par MemoEtude ; progrès gardés dans ce navigateur (MemoProgres, clé
 * 'pub:<jeton>'). Écran du code d'accès quand le partage en demande un.
 */
(function () {
  'use strict';
  const P = window.EtabliPublic, ME = window.MemoEtude, PR = window.MemoProgres;
  const NB = ' ';
  const S = { jeton: null, instance: null, cle: null, etats: {}, jours: [], minuterie: null };
  const contenu = () => document.getElementById('contenu');
  const tete = () => document.querySelector('.pub-tete');
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (let i = 2; i < arguments.length; i++) { const x = arguments[i]; if (x !== null && x !== undefined && x !== false) el.appendChild(x instanceof Node ? x : document.createTextNode(String(x))); }
    return el;
  }
  const SVG = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICO = {
    agrandir: '<path d="M5 19V14M5 19h5M19 5h-5M19 5v5M5 19l6-6M19 5l-6 6"/>',
    pleinEcran: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    quitter: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  };

  function jetonDeLAdresse() {
    const m = /^\/a\/([A-Za-z0-9_-]{16,80})\/?$/.exec(location.pathname);
    if (m) return m[1];
    try { const q = new URLSearchParams(location.search).get('jeton'); if (q && /^[A-Za-z0-9_-]{16,80}$/.test(q)) return q; } catch (e) { /* rien */ }
    return null;
  }

  function message(titre, texte, o) {
    o = o || {};
    const t = tete();
    if (t) t.hidden = true;
    const boutons = (o.boutons || []).map((b, i) => h('button', { type: 'button', class: 'pub-btn' + (i === 0 ? ' pub-btn-primaire' : ''), onclick: b.fn }, b.label));
    contenu().replaceChildren(h('div', { class: 'pub-message' + (o.erreur ? ' erreur' : ''), role: o.erreur ? 'alert' : null },
      h('span', { class: 'pub-message-ico', html: SVG(ICO.attention) }), h('h2', {}, titre), texte ? h('p', {}, texte) : null,
      boutons.length ? h('div', { class: 'pub-boutons' }, boutons) : null));
  }

  function ecranCode(o) {
    o = o || {};
    const t = tete();
    if (t) t.hidden = true;
    const champ = h('input', { class: 'pub-input', type: 'text', id: 'mp-code', name: 'code', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: '12', 'aria-describedby': 'mp-code-aide mp-code-err', 'aria-invalid': o.faux ? 'true' : null, required: true });
    const err = h('p', { class: 'pub-erreur-champ', id: 'mp-code-err', role: 'alert' }, o.faux ? 'Ce code n’est pas le bon. Vérifie les majuscules, puis réessaie.' : o.limite ? 'Trop d’essais. Attends un quart d’heure, puis réessaie.' : '');
    if (!err.textContent) err.hidden = true;
    const bouton = h('button', { type: 'submit', class: 'pub-btn pub-btn-primaire', disabled: o.limite ? true : null }, 'Ouvrir');
    const form = h('form', { novalidate: true }, h('label', { class: 'pub-champ', for: 'mp-code' }, h('span', {}, 'Code d’accès'), champ), err, bouton);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = champ.value.trim();
      if (v.length < 4) { err.textContent = 'Le code compte au moins 4 caractères.'; err.hidden = false; champ.setAttribute('aria-invalid', 'true'); champ.focus(); return; }
      bouton.disabled = true;
      bouton.textContent = 'Vérification…';
      P.memoriserCode(S.jeton, v);
      await charger(true);
    });
    contenu().replaceChildren(h('section', { class: 'pub-code', 'aria-labelledby': 'mp-code-titre' },
      h('span', { class: 'pub-message-ico', html: SVG(ICO.cadenas) }),
      h('h1', { id: 'mp-code-titre' }, 'Ces cartes sont protégées par un code'),
      h('p', { id: 'mp-code-aide' }, 'Tape le code donné par ton enseignant·e. Il reste mémorisé dans cet onglet.'),
      form));
    document.title = 'Code d’accès';
    // focus tout de suite : le champ vient d'être placé dans la page
    champ.focus();
  }

  function outils() {
    const z = document.getElementById('outils');
    const proj = h('button', { type: 'button', class: 'mp-outil', 'aria-pressed': 'false', title: 'Agrandir (projection au tableau)', 'aria-label': 'Agrandir pour la projection', html: SVG(ICO.agrandir) });
    const appliquer = (v) => {
      document.documentElement.classList.toggle('pub-projection', v);
      proj.setAttribute('aria-pressed', String(v));
      try { if (v) sessionStorage.setItem('etabli.projection', '1'); else sessionStorage.removeItem('etabli.projection'); } catch (e) { /* rien */ }
    };
    proj.addEventListener('click', () => appliquer(!document.documentElement.classList.contains('pub-projection')));
    let deja = false;
    try { deja = sessionStorage.getItem('etabli.projection') === '1'; } catch (e) { /* rien */ }
    appliquer(deja || /[?&]projeter=1/.test(location.search));
    z.replaceChildren(proj);
    if (document.fullscreenEnabled) {
      const pe = h('button', { type: 'button', class: 'mp-outil', title: 'Plein écran', 'aria-label': 'Plein écran', html: SVG(ICO.pleinEcran) });
      pe.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
      document.addEventListener('fullscreenchange', () => { const a = !!document.fullscreenElement; pe.innerHTML = SVG(a ? ICO.quitter : ICO.pleinEcran); pe.setAttribute('aria-label', a ? 'Quitter le plein écran' : 'Plein écran'); });
      z.appendChild(pe);
    }
  }

  function garder(immediat) {
    clearTimeout(S.minuterie);
    const go = () => PR.ecrire(S.cle, { etats: S.etats, jours: S.jours }).catch(() => {});
    if (immediat) return go();
    S.minuterie = setTimeout(go, 400);
  }

  async function rendre(d) {
    const data = d.data || {};
    const t = tete();
    if (t) t.hidden = false;
    document.title = (d.titre || 'Cartes mémoire') + ' · Cartes mémoire';
    document.getElementById('titre').textContent = P.typo(d.titre || 'Cartes mémoire');
    const desc = document.getElementById('desc');
    desc.textContent = P.typo(data.description || '');
    desc.hidden = !data.description;
    outils();
    S.cle = PR.clePublic(S.jeton);
    try { const pr = await PR.lire(S.cle); S.etats = pr.etats; S.jours = pr.jours; } catch (e) { S.etats = {}; S.jours = []; }
    if (!PR.local()) document.getElementById('mp-progres').textContent = 'Ce navigateur ne garde pas les progrès (navigation privée\u202f?)\u202f: ils seront perdus en fermant la page.';
    const zone = h('div', { class: 'mp-zone' });
    contenu().replaceChildren(zone);
    if (S.instance) { try { S.instance.detruire(); } catch (e) { /* rien */ } }
    S.instance = ME.monter(zone, {
      paquet: { id: S.jeton, titre: d.titre || 'Cartes mémoire', data }, etats: S.etats, jours: S.jours, titre: false,
      mode: 'jour',
      surRevision: () => garder(false),
      surFin: () => garder(true),
    });
    window.addEventListener('pagehide', () => garder(true));
  }

  async function charger(depuisCode) {
    try {
      const d = await P.partage(S.jeton);
      if (!d || d.genre !== 'memo') throw Object.assign(new Error('genre'), { code: 'introuvable' });
      await rendre(d);
    } catch (e) {
      const code = e && e.code;
      if (code === 'code_requis') ecranCode({});
      else if (code === 'code_faux') { P.oublierCode(S.jeton); ecranCode({ faux: true }); }
      else if (code === 'limite') { P.oublierCode(S.jeton); ecranCode({ limite: true }); }
      else if (code === 'introuvable') { document.title = 'Lien inactif'; message('Ce lien n’est plus actif', 'L’enseignant·e a retiré ces cartes, ou en a fait un nouveau lien. Demande-lui le nouveau lien.', { erreur: true }); }
      else message('Impossible de charger les cartes', 'Vérifie ta connexion à internet, puis réessaie.', { erreur: true, boutons: [{ label: 'Réessayer', fn: () => charger() }] });
    }
  }

  S.jeton = jetonDeLAdresse();
  if (!S.jeton) message('Adresse incomplète', 'Il manque une partie du lien. Vérifie l’adresse ou scanne à nouveau le QR code.', { erreur: true });
  else charger();
})();
