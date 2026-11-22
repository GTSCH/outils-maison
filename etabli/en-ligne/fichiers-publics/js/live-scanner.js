/*
 * L'Établi : scanner des cartes (mode cartes, façon Plickers), repris de Main levée (pilote/index.html).
 * La détection tourne dans /js/live-scanner-worker.js (aruco + cv + dictionnaire des cartes), l'interface reste fluide.
 *
 * const sc = LiveScanner.creer({ etat: () => S, envoyer: (m) => bool, nomCarte: (n) => '', surResultats: () => {} })
 * sc.ouvrir(), sc.fermer(), sc.maj() (à chaque nouvel état), sc.ouvert()
 * LiveScanner.saisieManuelle({ etat, envoyer, nomCarte, carte })   saisie d'une réponse sans caméra
 * LiveScanner.verifierCamera() -> { ok, titre, message }
 * Dépend de live-commun.js et etabli-ui.js.
 */
(function (global) {
  'use strict';
  const { h, LETTRES } = global.Live;

  function verifierCamera() {
    if (!global.isSecureContext) {
      return { ok: false, titre: 'Caméra indisponible sur cette adresse', message: 'Le navigateur ne donne accès à la caméra que sur une adresse sécurisée (https) ou sur localhost. Ouvre cette page avec son adresse en https, ou saisis les réponses à la main.' };
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, titre: 'Caméra indisponible', message: 'Ce navigateur ne donne pas accès à la caméra. Essaie avec un navigateur récent (Chrome, Safari, Firefox, Edge), ou saisis les réponses à la main.' };
    }
    return { ok: true };
  }

  const questionDe = (S) => (S && S.config && S.config.questions ? S.config.questions[S.etat.index] : null);

  /* ------------------------------------------------------------------ saisie manuelle */
  function saisieManuelle(o) {
    const S = o.etat();
    const q = questionDe(S);
    if (!S || S.etat.statut !== 'question' || !global.Live.compatibleCartes(q)) {
      global.Live.toast('La saisie des cartes se fait pendant une question à choix multiple (4 réponses au plus).');
      return Promise.resolve(null);
    }
    const noms = global.Live.nomsClasse(S.config.classe);
    const nb = Math.max(noms.length, ...(S.cartesVues || []), 0);
    let champ;
    if (noms.length) {
      champ = h('select', { class: 'select', id: 'lv-manuel-carte' });
      for (let i = 1; i <= Math.min(global.Live.MAX_CARTES, Math.max(nb, noms.length)); i++) {
        champ.append(h('option', { value: String(i) }, i + (noms[i - 1] ? ' · ' + noms[i - 1] : '')));
      }
    } else {
      champ = h('input', { class: 'input', id: 'lv-manuel-carte', type: 'number', min: '1', max: String(global.Live.MAX_CARTES), inputmode: 'numeric', value: '1' });
    }
    if (o.carte) champ.value = String(o.carte);
    const etatLigne = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' }, 'Choisis la carte, puis la lettre levée.');
    const lettres = h('div', { class: 'lv-manuel-lettres', role: 'group', 'aria-label': 'Lettre levée' });
    const retirer = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, global.Live.ic('croix'), 'Retirer la réponse de cette carte');
    const actuelle = () => {
      const s = o.etat();
      const n = Number(champ.value);
      const x = (s.cartes || []).find((c) => c.carte === n);
      return x ? x.lettre : null;
    };
    const dessinerLettres = () => {
      const deja = actuelle();
      lettres.replaceChildren(...q.options.map((opt, i) => h('button', {
        type: 'button', class: 'btn', 'aria-pressed': deja === LETTRES[i] ? 'true' : 'false', title: opt.texte || '',
        onclick: () => {
          const n = Number(champ.value);
          if (!(n >= 1 && n <= global.Live.MAX_CARTES)) { etatLigne.textContent = global.Live.typo('Numéro de carte entre 1 et ' + global.Live.MAX_CARTES + '.'); champ.focus(); return; }
          const ok = o.envoyer({ t: 'carte', q: o.etat().etat.index, carte: n, lettre: LETTRES[i] });
          if (!ok) { etatLigne.textContent = 'Pas de connexion pour l’instant.'; return; }
          const nom = o.nomCarte(n);
          etatLigne.textContent = global.Live.typo('Carte ' + n + (nom ? ' (' + nom + ')' : '') + ' : ' + LETTRES[i] + ' enregistrée.');
          // carte suivante, pour enchaîner vite
          if (champ.tagName === 'SELECT') { if (champ.selectedIndex < champ.options.length - 1) champ.selectedIndex++; }
          else if (n < global.Live.MAX_CARTES) champ.value = String(n + 1);
          setTimeout(dessinerLettres, 400);
        },
      }, LETTRES[i])));
      retirer.hidden = !deja;
    };
    retirer.onclick = () => {
      const n = Number(champ.value);
      if (o.envoyer({ t: 'retirerCarte', q: o.etat().etat.index, carte: n })) {
        etatLigne.textContent = global.Live.typo('Réponse de la carte ' + n + ' retirée.');
        setTimeout(dessinerLettres, 400);
      }
    };
    champ.addEventListener('input', dessinerLettres);
    champ.addEventListener('change', dessinerLettres);
    dessinerLettres();
    const contenu = h('div', { class: 'lv-manuel' },
      h('p', {}, 'Question ' + (S.etat.index + 1) + ' : ' + (q.texte || '').slice(0, 120)),
      h('label', { class: 'field', for: 'lv-manuel-carte' }, h('span', {}, 'Carte'), champ),
      lettres, retirer, etatLigne);
    return global.EtabliUI.dialogue({ titre: 'Saisir une carte à la main', contenu, actions: [{ label: 'Terminer', primaire: true, valeur: null }] });
  }

  /* ------------------------------------------------------------------ scanner caméra */
  function creer(o) {
    let racine = null, video = null, calque = null;
    let flux = null, worker = null, actif = false, enCours = false, verrou = null;
    let lectures = new Map(); // carte -> {lettre, n, t}
    let envoyees = new Map(); // carte -> lettre déjà transmise pour la question
    let dernieres = [];
    let indexQuestion = -1;
    const grab = document.createElement('canvas');
    const gctx = grab.getContext('2d', { willReadFrequently: true });
    const el = {};

    function construire() {
      if (racine) return;
      video = h('video', { playsinline: true, muted: true, autoplay: true });
      video.muted = true;
      calque = h('canvas', { 'aria-hidden': 'true' });
      el.q = h('span', {}, 'Question');
      el.nb = h('span', { class: 'gros' }, '0 carte');
      el.rep = h('div', { class: 'lv-sc-repartition', 'aria-live': 'polite' });
      el.zoom = h('input', { type: 'range', min: '1', max: '1', step: '0.1', value: '1', 'aria-label': 'Zoom' });
      el.zoomZone = h('label', { class: 'lv-sc-zoom', hidden: true }, 'Zoom', el.zoom);
      el.res = h('button', { type: 'button', class: 'btn', onclick: () => { const S = o.etat(); if (S) o.envoyer({ t: 'reveler', valeur: !S.etat.revele }); } }, 'Résultats');
      el.message = h('div', { class: 'lv-sc-message', hidden: true });
      el.conseil = h('p', { class: 'lv-sc-conseil' }, 'Vise la salle et tiens l’appareil stable. Les cartes lues s’entourent en vert.');
      racine = h('div', { class: 'lv-scanner', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Scanner des cartes', hidden: true },
        h('div', { class: 'lv-sc-barre' }, el.q, el.nb),
        h('div', { class: 'lv-sc-zone' }, video, calque, el.conseil, el.message),
        h('div', { class: 'lv-sc-barre lv-sc-bas' },
          el.rep, el.zoomZone,
          h('div', { class: 'lv-sc-btns' },
            el.res,
            h('button', { type: 'button', class: 'btn', onclick: () => saisieManuelle(o) }, global.Live.ic('clavier'), 'Saisie manuelle'),
            h('button', { type: 'button', class: 'btn btn-primary', onclick: fermer }, 'Terminer le scan'))));
      racine.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.eb-voile')) { e.stopPropagation(); fermer(); } });
      document.body.appendChild(racine);
    }

    function reinitialiser() {
      const S = o.etat();
      lectures = new Map();
      envoyees = new Map(((S && S.cartes) || []).map((x) => [x.carte, x.lettre]));
    }

    function maj() {
      const S = o.etat();
      if (!S) return;
      if (S.etat.index !== indexQuestion) { indexQuestion = S.etat.index; reinitialiser(); }
      if (!racine || racine.hidden) return;
      const q = questionDe(S);
      if (!global.Live.compatibleCartes(q) || S.etat.statut !== 'question') { fermer(); return; }
      for (const x of S.cartes || []) envoyees.set(x.carte, x.lettre);
      const nb = (S.cartes || []).length;
      el.q.textContent = global.Live.typo('Question ' + (S.etat.index + 1) + ' / ' + S.config.questions.length);
      el.nb.textContent = global.Live.pluriel(nb, 'carte', 'cartes');
      el.rep.replaceChildren(...q.options.map((_, i) => h('span', {}, h('b', {}, LETTRES[i]), String((S.cartes || []).filter((x) => x.lettre === LETTRES[i]).length))));
      el.res.textContent = S.etat.revele ? 'Masquer les résultats' : 'Afficher les résultats';
    }

    function message(titre, texte) {
      el.message.hidden = false;
      el.conseil.hidden = true;
      el.message.replaceChildren(h('div', {}, h('h2', {}, titre), h('p', {}, texte),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => saisieManuelle(o) }, global.Live.ic('clavier'), 'Saisir à la main')));
    }

    async function ouvrir() {
      const S = o.etat();
      if (!S || S.etat.statut !== 'question' || !global.Live.compatibleCartes(questionDe(S))) {
        global.Live.toast('Le scan se fait pendant une question à choix multiple de 4 réponses au plus.');
        return;
      }
      const cam = verifierCamera();
      if (!cam.ok) {
        const v = await global.EtabliUI.dialogue({
          titre: cam.titre,
          contenu: '<p>' + global.EtabliUI.esc(global.Live.typo(cam.message)) + '</p>',
          actions: [{ label: 'Fermer', valeur: null }, { label: 'Saisir à la main', primaire: true, valeur: 'manuel' }],
        });
        if (v === 'manuel') saisieManuelle(o);
        return;
      }
      construire();
      racine.hidden = false;
      el.message.hidden = true;
      el.conseil.hidden = false;
      actif = true;
      maj();
      try {
        flux = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      } catch (e) {
        actif = false;
        const refus = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        const absente = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
        message(refus ? 'Caméra refusée' : absente ? 'Aucune caméra trouvée' : 'Caméra indisponible',
          refus ? 'Autorise la caméra pour ce site dans les réglages du navigateur, puis rouvre le scanner.'
            : absente ? 'Cet appareil ne semble pas avoir de caméra. Utilise la télécommande sur ton téléphone, ou saisis les réponses à la main.'
              : 'La caméra est peut-être utilisée par une autre application. Ferme-la, puis rouvre le scanner.');
        return;
      }
      if (!actif) { flux.getTracks().forEach((t) => t.stop()); flux = null; return; }
      video.srcObject = flux;
      try { await video.play(); } catch (e) { /* lecture automatique bloquée : la vidéo démarre au premier geste */ }
      try { if (navigator.wakeLock) verrou = await navigator.wakeLock.request('screen'); } catch (e) { verrou = null; }
      const piste = flux.getVideoTracks()[0];
      const caps = (piste && piste.getCapabilities && piste.getCapabilities()) || {};
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        const z = el.zoom;
        z.min = caps.zoom.min; z.max = Math.min(caps.zoom.max, 8); z.step = caps.zoom.step || 0.1;
        z.value = (piste.getSettings && piste.getSettings().zoom) || caps.zoom.min;
        z.oninput = () => piste.applyConstraints({ advanced: [{ zoom: Number(z.value) }] }).catch(() => {});
        el.zoomZone.hidden = false;
      }
      if (!worker) {
        try {
          worker = new Worker('/js/live-scanner-worker.js');
          worker.onmessage = (ev) => resultat(ev.data);
          worker.onerror = () => { message('Lecteur de cartes indisponible', 'Le module de lecture n’a pas pu démarrer. Recharge la page, ou saisis les réponses à la main.'); };
        } catch (e) {
          message('Lecteur de cartes indisponible', 'Ce navigateur ne permet pas la lecture des cartes. Saisis les réponses à la main.');
          return;
        }
      }
      reinitialiser();
      maj();
      boucle();
    }

    function fermer() {
      actif = false;
      enCours = false;
      if (racine) racine.hidden = true;
      if (flux) flux.getTracks().forEach((t) => t.stop());
      flux = null;
      if (video) video.srcObject = null;
      if (verrou && verrou.release) verrou.release().catch(() => {});
      verrou = null;
      if (o.surFermer) o.surFermer();
    }

    function boucle() {
      if (!actif) return;
      if (enCours || video.readyState < 2 || !video.videoWidth) { requestAnimationFrame(boucle); return; }
      const vw = video.videoWidth, vh = video.videoHeight;
      const k = Math.min(1, 1920 / Math.max(vw, vh));
      grab.width = Math.round(vw * k);
      grab.height = Math.round(vh * k);
      gctx.drawImage(video, 0, 0, grab.width, grab.height);
      const img = gctx.getImageData(0, 0, grab.width, grab.height);
      enCours = true;
      worker.postMessage({ width: img.width, height: img.height, buffer: img.data.buffer, k }, [img.data.buffer]);
    }

    function resultat(r) {
      enCours = false;
      const S = o.etat();
      if (!actif || !S) return;
      const q = questionDe(S);
      if (!q) return;
      const maintenant = Date.now();
      dernieres = r.cartes.map((c) => Object.assign({}, c, { k: grab.width / video.videoWidth }));
      for (const c of dernieres) {
        if (LETTRES.indexOf(c.lettre) >= q.options.length) { c.horsChoix = true; continue; }
        const l = lectures.get(c.carte);
        if (l && l.lettre === c.lettre && maintenant - l.t < 3000) { l.n++; l.t = maintenant; }
        else lectures.set(c.carte, { lettre: c.lettre, n: 1, t: maintenant });
        if (lectures.get(c.carte).n >= 2 && envoyees.get(c.carte) !== c.lettre) {
          envoyees.set(c.carte, c.lettre);
          o.envoyer({ t: 'carte', q: S.etat.index, carte: c.carte, lettre: c.lettre });
          try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) {}
        }
      }
      dessiner();
      setTimeout(() => requestAnimationFrame(boucle), 30);
    }

    function dessiner() {
      const W = calque.clientWidth, H = calque.clientHeight;
      const dpr = global.devicePixelRatio || 1;
      if (calque.width !== Math.round(W * dpr)) { calque.width = Math.round(W * dpr); calque.height = Math.round(H * dpr); }
      const ctx = calque.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) return;
      const s = Math.min(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
      ctx.font = '700 18px Lexend, "Atkinson Hyperlegible", Arial, sans-serif';
      for (const c of dernieres) {
        const pts = c.coins.map((p) => ({ x: ox + (p.x / c.k) * s, y: oy + (p.y / c.k) * s }));
        const ok = envoyees.get(c.carte) === c.lettre;
        const couleur = c.horsChoix ? '#F5A33A' : ok ? '#5CC98B' : '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeStyle = couleur;
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
        const minY = Math.min(...pts.map((p) => p.y));
        const cxp = pts.reduce((a, p) => a + p.x, 0) / 4;
        const largeur = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const nom = largeur > 80 ? o.nomCarte(c.carte) : '';
        const txt = c.carte + ' · ' + (c.horsChoix ? '?' : c.lettre) + (nom ? ' ' + nom : '');
        const lw = ctx.measureText(txt).width + 12;
        ctx.fillStyle = couleur;
        ctx.fillRect(cxp - lw / 2, minY - 30, lw, 26);
        ctx.fillStyle = '#141A1E';
        ctx.fillText(txt, cxp - lw / 2 + 6, minY - 11);
      }
    }

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && actif && !verrou) {
        try { if (navigator.wakeLock) verrou = await navigator.wakeLock.request('screen'); } catch (e) { verrou = null; }
      }
    });

    return { ouvrir, fermer, maj, ouvert: () => !!(racine && !racine.hidden), _lectures: () => lectures };
  }

  global.LiveScanner = { creer, saisieManuelle, verifierCamera };
})(typeof window !== 'undefined' ? window : globalThis);
