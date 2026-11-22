/*
 * L'Établi : cadre commun des pages publiques des murs, des galeries et du portail (window.PagePub).
 * Utilisé par /p/mur.html, /p/galerie.html et /p/portail.html (servies sous /m/<jeton>, /g/<jeton>, /c/<jeton>).
 * Dépend de /js/etabli-public.js (EtabliPublic) et de /mur/rendu.js (MurRendu). Aucun compte, aucun cookie.
 *
 * PagePub.demarrer({ genre, prefixe: 'm'|'g'|'c', rendre(donnees, premiere), libelle })
 *   lit le jeton dans l'adresse, charge les données (code d'accès mémorisé pour l'onglet), affiche l'écran du
 *   code au besoin, puis appelle rendre(). Relecture toutes les 60 s quand la page est visible.
 * PagePub.message(titre, texte, o), PagePub.toast(texte, o), PagePub.feuille(o), PagePub.recharger()
 * PagePub.outils() : boutons discrets (agrandir le texte, plein écran) ; PagePub.formulaireDepot(o) : dépôt d'un·e élève
 */
(function (g) {
  'use strict';
  if (g.PagePub) return;
  const R = g.MurRendu;
  const { h, ico, NB } = R;
  const P = {};
  const etat = { jeton: null, o: null, dernier: 0, enCours: false, donnees: null, premiere: true };

  function jetonDeLAdresse(prefixe) {
    const m = new RegExp('^/' + prefixe + '/([A-Za-z0-9_-]{16,80})/?$').exec(location.pathname);
    if (m) return m[1];
    try { const q = new URLSearchParams(location.search).get('jeton'); if (q && /^[A-Za-z0-9_-]{16,80}$/.test(q)) return q; } catch (e) { /* rien */ }
    return null;
  }
  const contenu = () => document.getElementById('contenu');
  const tete = () => document.querySelector('.pub-tete');

  /* ---------------- messages ---------------- */
  function message(titre, texte, o) {
    o = o || {};
    const b = h('div', { class: 'pub-message' + (o.erreur ? ' erreur' : '') + (o.ok ? ' ok' : ''), role: o.erreur ? 'alert' : null },
      h('span', { class: 'pub-message-ico', html: ico(o.icone || (o.erreur ? 'attention' : 'mur')) }),
      h('h2', {}, titre),
      texte ? h('p', {}, texte) : null,
      o.boutons && o.boutons.length ? h('div', { class: 'pub-boutons' }, o.boutons.map((x, i) => {
        const el = x.href ? h('a', { class: 'pub-btn' + (i === 0 ? ' pub-btn-primaire' : ''), href: x.href }, x.label) : h('button', { type: 'button', class: 'pub-btn' + (i === 0 ? ' pub-btn-primaire' : '') }, x.label);
        if (x.fn) el.addEventListener('click', x.fn);
        return el;
      })) : null);
    if (o.retour) return b;
    const t = tete();
    if (t && o.cacherTete !== false) t.hidden = true;
    contenu().replaceChildren(b);
    return b;
  }

  let zoneToasts = null;
  function toast(texte, o) {
    o = o || {};
    if (!zoneToasts) { zoneToasts = h('div', { class: 'pub-toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(zoneToasts); }
    const t = h('div', { class: 'pub-toast' + (o.erreur ? ' erreur' : '') }, texte);
    zoneToasts.appendChild(t);
    setTimeout(() => t.remove(), o.duree || (o.erreur ? 6000 : 4000));
  }

  /* ---------------- feuille (dialogue) ---------------- */
  function feuille(o) {
    const precedent = document.activeElement;
    const idT = 'pub-f-' + Math.random().toString(36).slice(2, 8);
    const bFermer = h('button', { type: 'button', class: 'pub-btn pub-btn-discret pub-btn-icone', 'aria-label': 'Fermer', html: ico('fermer') });
    const f = h('div', { class: 'pub-feuille', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idT },
      h('div', { class: 'pub-feuille-tete' }, h('h2', { id: idT }, o.titre || ''), bFermer),
      o.contenu);
    const voile = h('div', { class: 'pub-voile' }, f);
    function fermer(v) {
      document.removeEventListener('keydown', clavier, true);
      voile.remove();
      if (precedent && precedent.focus && document.contains(precedent)) precedent.focus();
      if (o.surFermer) o.surFermer(v);
    }
    function clavier(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(null); return; }
      if (e.key === 'Tab') {
        const els = Array.from(f.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!els.length) return;
        const a = els.indexOf(document.activeElement);
        if (e.shiftKey && a <= 0) { e.preventDefault(); els[els.length - 1].focus(); }
        else if (!e.shiftKey && a === els.length - 1) { e.preventDefault(); els[0].focus(); }
      }
    }
    bFermer.addEventListener('click', () => fermer(null));
    voile.addEventListener('mousedown', (e) => { if (e.target === voile) fermer(null); });
    document.addEventListener('keydown', clavier, true);
    document.body.appendChild(voile);
    setTimeout(() => { const p = f.querySelector('input:not([type="hidden"]):not([type="file"]), textarea, select') || bFermer; p.focus(); }, 30);
    return { fermer, el: f };
  }

  /* ---------------- code d'accès ---------------- */
  function ecranCode(o) {
    o = o || {};
    const t = tete();
    if (t) t.hidden = true;
    const champ = h('input', { class: 'pub-input', type: 'text', id: 'pub-code-champ', name: 'code', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: '12', 'aria-describedby': 'pub-code-aide pub-code-err', 'aria-invalid': o.faux ? 'true' : null, required: true });
    const err = h('p', { class: 'pub-erreur-champ', id: 'pub-code-err', role: 'alert' }, o.faux ? 'Ce code n’est pas le bon. Vérifie les majuscules, puis réessaie.' : o.limite ? 'Trop d’essais. Attends un quart d’heure, puis réessaie.' : '');
    if (!err.textContent) err.hidden = true;
    const bouton = h('button', { type: 'submit', class: 'pub-btn pub-btn-primaire', disabled: o.limite ? true : null }, 'Ouvrir');
    const form = h('form', { novalidate: true },
      h('label', { class: 'pub-champ', for: 'pub-code-champ' }, h('span', {}, 'Code d’accès'), champ),
      err, bouton);
    const nom = (etat.o && etat.o.libelle) || 'Cette page';
    const bloc = h('section', { class: 'pub-code', 'aria-labelledby': 'pub-code-titre' },
      h('span', { class: 'pub-message-ico', html: ico('cadenas') }),
      h('h1', { id: 'pub-code-titre' }, nom + ' est protégé' + (/^(Cette|La|Une)/.test(nom) ? 'e' : '') + ' par un code'),
      h('p', { id: 'pub-code-aide' }, 'Tape le code donné par ton enseignant·e. Il reste mémorisé dans cet onglet.'),
      form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = champ.value.trim();
      if (v.length < 4) { err.textContent = 'Le code compte au moins 4 caractères.'; err.hidden = false; champ.setAttribute('aria-invalid', 'true'); champ.focus(); return; }
      bouton.disabled = true;
      bouton.textContent = 'Vérification…';
      try { g.EtabliPublic.memoriserCode(etat.jeton, v); } catch (x) { /* rien */ }
      await charger({ depuisCode: true });
    });
    contenu().replaceChildren(bloc);
    document.title = 'Code d’accès';
    setTimeout(() => { const a = document.activeElement; if (a && a !== champ && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; champ.focus(); }, 30);
  }

  /* ---------------- chargement ---------------- */
  async function charger(c) {
    c = c || {};
    if (etat.enCours) return;
    etat.enCours = true;
    etat.dernier = Date.now();
    try {
      const d = await g.EtabliPublic.partage(etat.jeton);
      if (etat.o.genres && d && d.genre && etat.o.genres.indexOf(d.genre) === -1) throw Object.assign(new Error('genre'), { code: 'introuvable' });
      etat.donnees = d;
      const t = tete();
      if (t) t.hidden = false;
      etat.o.rendre(d, etat.premiere);
      etat.premiere = false;
    } catch (e) {
      const code = e && e.code;
      if (code === 'code_requis') ecranCode({});
      else if (code === 'code_faux') { try { g.EtabliPublic.oublierCode(etat.jeton); } catch (x) { /* rien */ } ecranCode({ faux: true }); }
      else if (code === 'limite' && (c.depuisCode || !etat.donnees)) { try { g.EtabliPublic.oublierCode(etat.jeton); } catch (x) { /* rien */ } ecranCode({ limite: true }); }
      else if (code === 'introuvable') {
        document.title = 'Lien inactif';
        message('Ce lien n’est plus actif', 'L’enseignant·e a retiré cette page, ou en a créé une nouvelle. Demande-lui le nouveau lien.', { erreur: true });
      } else if (etat.donnees && !c.depuisCode) {
        // relecture en arrière-plan : on garde ce qui est affiché
      } else {
        message('Impossible de charger la page', 'Vérifie ta connexion à internet, puis réessaie.', { erreur: true, boutons: [{ label: 'Réessayer', fn: () => charger() }] });
      }
    } finally {
      etat.enCours = false;
    }
  }

  /* ---------------- outils de projection ---------------- */
  function lsGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* rien */ } }
  function outils(o) {
    o = o || {};
    const z = h('div', { class: 'pub-outils' });
    const proj = h('button', { type: 'button', class: 'pub-btn pub-btn-petit pub-btn-discret pub-btn-icone', 'aria-pressed': 'false', title: 'Agrandir le texte (projection)', 'aria-label': 'Agrandir le texte pour la projection', html: ico('agrandir') });
    const appliquer = (v) => {
      document.documentElement.classList.toggle('pub-projection', v);
      proj.setAttribute('aria-pressed', String(v));
      lsSet('etabli.projection', v ? '1' : null);
    };
    proj.addEventListener('click', () => appliquer(!document.documentElement.classList.contains('pub-projection')));
    appliquer(lsGet('etabli.projection') === '1' || /[?&]projeter=1/.test(location.search));
    z.appendChild(proj);
    if (document.fullscreenEnabled) {
      const pe = h('button', { type: 'button', class: 'pub-btn pub-btn-petit pub-btn-discret pub-btn-icone', title: 'Plein écran', 'aria-label': 'Plein écran', html: ico('pleinEcran') });
      pe.addEventListener('click', () => { if (document.fullscreenElement) R.sortirPleinEcran(); else R.entrerPleinEcran(document.documentElement); });
      document.addEventListener('fullscreenchange', () => {
        const a = !!document.fullscreenElement;
        pe.innerHTML = ico(a ? 'quitterPleinEcran' : 'pleinEcran');
        pe.setAttribute('aria-label', a ? 'Quitter le plein écran' : 'Plein écran');
      });
      z.appendChild(pe);
    }
    (o.avant || []).forEach((b) => z.insertBefore(b, z.firstChild));
    return z;
  }

  /* ---------------- formulaire de dépôt (mur, galerie) ---------------- */
  /**
   * Ouvre la feuille de dépôt.
   * o = { genre: 'mur'|'galerie', mode: 'moderes'|'libres', nomRequis, sections: [{ id, titre }] (sections permises),
   *       surDepot(depot) }
   */
  function formulaireDepot(o) {
    const galerie = o.genre === 'galerie';
    const sections = (o.sections || []).filter((s) => s && s.id);
    let fichier = null;
    const id = (s) => 'pub-d-' + s;
    const nom = h('input', { class: 'pub-input', id: id('nom'), type: 'text', maxlength: '40', autocomplete: 'off', autocapitalize: 'words', required: o.nomRequis ? true : null, 'aria-describedby': id('nom-aide') });
    const section = sections.length > 1 ? h('select', { class: 'pub-select', id: id('section') }, sections.map((s) => h('option', { value: s.id }, s.titre || 'Sans titre'))) : null;
    const texte = h('textarea', { class: 'pub-textarea', id: id('texte'), maxlength: '2000', rows: galerie ? '2' : '4' });
    const lien = galerie ? null : h('input', { class: 'pub-input', id: id('lien'), type: 'url', inputmode: 'url', maxlength: '2000', placeholder: 'https://…' });
    const entree = h('input', { type: 'file', id: id('fichier'), accept: galerie ? 'image/jpeg,image/png,image/webp,image/gif' : 'image/jpeg,image/png,image/webp,image/gif,application/pdf' });
    const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', tabindex: '-1', 'aria-hidden': 'true' });
    const apercu = h('div', { class: 'pg-apercu', hidden: true });
    const nomFichier = h('span', { class: 'pub-fichier-nom', id: id('fichier-nom') }, galerie ? 'Aucune photo choisie.' : 'Aucun fichier choisi.');
    const retirer = h('button', { type: 'button', class: 'pub-btn pub-btn-petit pub-btn-discret', hidden: true }, 'Retirer');
    const erreur = h('p', { class: 'pub-erreur-champ', role: 'alert', hidden: true });
    const progression = h('div', { class: 'pub-progression', hidden: true, role: 'progressbar', 'aria-label': 'Envoi du fichier', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i'));
    const envoyer = h('button', { type: 'submit', class: 'pub-btn pub-btn-primaire pg-envoyer' }, h('span', { html: ico('envoyer') }), h('span', {}, 'Envoyer'));
    const choisir = h('label', { class: 'pub-btn pub-btn-petit', for: id('fichier') }, h('span', { html: ico(galerie ? 'image' : 'trombone') }), h('span', {}, galerie ? 'Choisir une photo' : 'Joindre un fichier'));
    const prendre = h('button', { type: 'button', class: 'pub-btn pub-btn-petit pg-photo', onclick: () => photo.click() }, h('span', { html: ico('camera') }), h('span', {}, 'Prendre une photo'));
    function montrerErreur(t, champ) { erreur.textContent = t; erreur.hidden = false; if (champ) { champ.setAttribute('aria-invalid', 'true'); champ.focus(); } }
    function choisirFichier(f) {
      erreur.hidden = true;
      if (!f) return;
      const refus = g.EtabliPublic.accepte ? g.EtabliPublic.accepte(f) : null;
      if (refus) { montrerErreur(refus); return; }
      if (galerie && !/^image\//.test(f.type)) { montrerErreur('Envoie une image (JPEG, PNG, WebP ou GIF).'); return; }
      fichier = f;
      nomFichier.textContent = f.name + ' (' + R.taille(f.size) + ')';
      retirer.hidden = false;
      apercu.replaceChildren();
      if (/^image\//.test(f.type) && g.URL && URL.createObjectURL) {
        const u = URL.createObjectURL(f);
        apercu.appendChild(h('img', { src: u, alt: '' }));
        apercu.hidden = false;
      } else apercu.hidden = true;
    }
    entree.addEventListener('change', () => { choisirFichier(entree.files && entree.files[0]); entree.value = ''; });
    photo.addEventListener('change', () => { choisirFichier(photo.files && photo.files[0]); photo.value = ''; });
    retirer.addEventListener('click', () => { fichier = null; apercu.hidden = true; apercu.replaceChildren(); retirer.hidden = true; nomFichier.textContent = galerie ? 'Aucune photo choisie.' : 'Aucun fichier choisi.'; });
    const form = h('form', { class: 'pg-depot', novalidate: true },
      h('p', { class: 'pg-depot-note' }, h('span', { html: ico('attention') }),
        galerie ? 'Photographie ton travail, pas les visages. Seulement ton prénom, jamais ton nom de famille.' : 'Seulement ton prénom. Pas de nom de famille, d’adresse ni de numéro de téléphone.'),
      h('label', { class: 'pub-champ', for: id('nom') }, h('span', {}, 'Ton prénom ', h('small', {}, o.nomRequis ? '(obligatoire)' : '(facultatif)')), nom),
      h('p', { class: 'pub-aide', id: id('nom-aide') }, 'Il s’affiche à côté de ton dépôt.'),
      section ? h('label', { class: 'pub-champ', for: id('section') }, h('span', {}, 'Où déposer' + NB + '?'), section) : null,
      galerie
        ? h('div', { class: 'pub-champ' }, h('span', {}, 'Ta photo ', h('small', {}, '(obligatoire, 10' + NB + 'Mo au plus)')), h('div', { class: 'pub-fichier' }, choisir, prendre, entree, photo, nomFichier, retirer), apercu)
        : null,
      h('label', { class: 'pub-champ', for: id('texte') }, h('span', {}, galerie ? 'Titre ou légende ' : 'Ton message ', h('small', {}, '(facultatif)')), texte),
      lien ? h('label', { class: 'pub-champ', for: id('lien') }, h('span', {}, 'Un lien ', h('small', {}, '(facultatif)')), lien) : null,
      galerie ? null : h('div', { class: 'pub-champ' }, h('span', {}, 'Un fichier ', h('small', {}, '(facultatif)' + NB + ': image ou PDF, 10' + NB + 'Mo au plus')), h('div', { class: 'pub-fichier' }, choisir, prendre, entree, photo, nomFichier, retirer), apercu),
      h('p', { class: 'pub-aide' }, o.mode === 'libres' ? 'Ton dépôt sera visible tout de suite sur la page.' : 'Ton dépôt sera visible après validation par ton enseignant·e.'),
      erreur, progression,
      h('div', { class: 'pub-boutons' }, envoyer));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      erreur.hidden = true;
      [nom, texte, lien].forEach((c) => c && c.removeAttribute('aria-invalid'));
      const v = { nom: nom.value.trim(), texte: texte.value.trim(), lien: lien ? lien.value.trim() : '' };
      if (o.nomRequis && !v.nom) return montrerErreur('Écris ton prénom.', nom);
      if (v.lien && !R.lienValide(v.lien)) return montrerErreur('Ce lien n’est pas valide : il doit commencer par https://', lien);
      if (galerie && !fichier) return montrerErreur('Choisis d’abord une photo de ton travail.', null);
      if (!galerie && !v.texte && !v.lien && !fichier) return montrerErreur('Ton dépôt est vide : écris un message, ajoute un lien ou un fichier.', texte);
      envoyer.disabled = true;
      envoyer.lastChild.textContent = 'Envoi…';
      if (fichier) { progression.hidden = false; progression.firstChild.style.width = '0'; }
      try {
        const d = await g.EtabliPublic.deposer(etat.jeton, {
          section: section ? section.value : (sections[0] && sections[0].id) || undefined,
          nom: v.nom, texte: v.texte || undefined, lien: v.lien ? R.lienValide(v.lien) : undefined,
          fichier: fichier || undefined,
          progression: (x) => { const pc = Math.round(x * 100); progression.firstChild.style.width = pc + '%'; progression.setAttribute('aria-valuenow', String(pc)); },
        });
        const publie = d && d.statut === 'publie';
        f.el.querySelector('form').replaceWith(h('div', { class: 'pub-message ok pg-merci', role: 'status' },
          h('span', { class: 'pub-message-ico', html: ico('check') }),
          h('h2', {}, publie ? 'Merci, ton dépôt est publié.' : 'Merci, ton dépôt sera visible après validation.'),
          h('p', {}, publie ? 'Il apparaît maintenant sur la page.' : 'Ton enseignant·e le regarde, puis le publie. Tu peux fermer cette fenêtre.'),
          h('div', { class: 'pub-boutons' },
            h('button', { type: 'button', class: 'pub-btn pub-btn-primaire', onclick: () => f.fermer(true) }, 'Fermer'),
            h('button', { type: 'button', class: 'pub-btn', onclick: () => { f.fermer(true); formulaireDepot(o); } }, 'Déposer autre chose'))));
        const ok = f.el.querySelector('.pg-merci .pub-btn');
        if (ok) ok.focus();
        if (o.surDepot) o.surDepot(d);
      } catch (x) {
        envoyer.disabled = false;
        envoyer.lastChild.textContent = 'Envoyer';
        progression.hidden = true;
        if (x && (x.code === 'code_requis' || x.code === 'code_faux')) { f.fermer(); charger(); return; }
        montrerErreur((x && x.message) || 'Le dépôt n’a pas pu partir. Réessaie.');
      }
    });
    const f = feuille({ titre: galerie ? 'Déposer une œuvre' : 'Déposer sur le mur', contenu: form });
    return f;
  }

  /* ---------------- démarrage ---------------- */
  function demarrer(o) {
    etat.o = o;
    etat.jeton = jetonDeLAdresse(o.prefixe);
    if (!etat.jeton) {
      message('Ce lien n’est pas complet', 'L’adresse semble coupée. Vérifie le lien reçu, ou demande-le à nouveau à ton enseignant·e.', { erreur: true });
      return;
    }
    if (!g.EtabliPublic || typeof g.EtabliPublic.partage !== 'function') {
      message('La page n’a pas pu se charger', 'Recharge la page dans un instant.', { erreur: true, boutons: [{ label: 'Recharger', fn: () => location.reload() }] });
      return;
    }
    charger();
    const periode = o.periode || 60000;
    setInterval(() => { if (document.visibilityState === 'visible' && etat.donnees && !document.querySelector('.pub-voile, .mr-vis') && Date.now() - etat.dernier >= periode - 500) charger(); }, Math.min(periode, 30000));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && etat.donnees && Date.now() - etat.dernier > periode) charger(); });
  }

  Object.assign(P, {
    demarrer, charger: (c) => charger(c), recharger: () => charger(), message, toast, feuille, outils, formulaireDepot,
    jeton: () => etat.jeton, donnees: () => etat.donnees, NB,
  });
  g.PagePub = P;
})(window);
