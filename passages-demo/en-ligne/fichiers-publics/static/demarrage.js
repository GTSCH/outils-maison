// Assistant de démarrage : bienvenue, import de la bibliothèque Zotero (lue dans le navigateur), connexion à Claude.
// Le dossier Zotero est lu sur l'ordinateur : seuls les références, PDF et surlignages choisis sont envoyés,
// et seulement vers cette bibliothèque.

import { $, $$, esc, nf, api, toast } from './core.js';

const SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/';
const MAX_UPLOAD = 95 * 1048576;

// ---------- connecteur Claude ----------
export async function connectorHtml() {
  let url = '';
  try {
    url = (await api('/api/connector')).url;
  } catch (e) {
    return `<p class="note">${esc(e.message)}</p>`;
  }
  return `<div class="cx">
    <p>Avec ce connecteur, Claude cherche dans le texte de tes PDF, lit les passages, voit tes surlignages, en ajoute sur demande, et cite avec des liens qui ouvrent le passage exact.</p>
    <label class="cx-url"><span>Adresse du connecteur (personnelle : ne la partage pas)</span>
      <span class="row"><input type="text" readonly value="${esc(url)}" data-cx-url><button type="button" class="btn primary" data-cx-copy>Copier</button></span></label>
    <ol class="cx-steps">
      <li>Dans Claude (site claude.ai ou application de bureau), ouvre <b>Personnaliser › Connecteurs</b> <span class="note">(en anglais : Customize › Connectors)</span>.</li>
      <li>Clique <b>+ Ajouter</b>, puis <b>Ajouter un connecteur personnalisé</b> <span class="note">(Add custom connector)</span>.</li>
      <li>Nom : <b>Ma bibliothèque</b>. Adresse : colle l’adresse copiée ci-dessus. Clique <b>Continuer</b>.</li>
      <li>Authentification : choisis <b>Sans connexion</b> <span class="note">(No sign in)</span> : l’adresse contient déjà ta clé. Clique <b>Ajouter</b>.</li>
      <li>Dans une conversation, bouton <b>+</b> en bas à gauche › <b>Connecteurs</b> : active « Ma bibliothèque ».</li>
    </ol>
    <p class="note">Avec l’offre gratuite de Claude, un seul connecteur personnalisé est possible.</p>
    <h3>À essayer dans Claude</h3>
    <ul class="cx-try">
      ${[
        'Qu’est-ce que ma bibliothèque dit de la métacognition ? Cite chaque idée avec un lien vers le passage.',
        'Fais-moi une synthèse de mes surlignages sur l’article le plus récent que j’ai annoté.',
        'Dans l’article de [auteur], surligne en vert le passage qui définit [notion] et donne-moi le lien.',
        'Rédige un paragraphe sur [sujet] à partir de mes PDF, avec des citations cliquables vers les passages.',
      ].map((t) => `<li><span>${esc(t)}</span> <button type="button" class="linkish" data-cx-try="${esc(t)}">Copier</button></li>`).join('')}
    </ul>
  </div>`;
}

export function bindConnector(root) {
  root.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cx-copy]');
    if (c) {
      await navigator.clipboard.writeText($('[data-cx-url]', root).value).catch(() => {});
      c.textContent = 'Copiée';
      setTimeout(() => (c.textContent = 'Copier'), 1800);
    }
    const t = e.target.closest('[data-cx-try]');
    if (t) {
      await navigator.clipboard.writeText(t.dataset.cxTry).catch(() => {});
      toast('Question copiée : colle-la dans Claude.');
    }
  });
}

// ---------- assistant ----------
export async function showSetup({ force = false, onDone = () => {}, processPending = null } = {}) {
  const st = await api('/api/setup');
  if (!force && (st.done || st.items > 0)) return;
  const d = document.createElement('dialog');
  d.className = 'setup';
  d.innerHTML = `<div class="dlg-head"><h2>Bienvenue dans ta bibliothèque</h2><button class="btn ghost" data-x aria-label="Fermer">✕</button></div>
    <ol class="setup-steps"><li data-s="1">Bienvenue</li><li data-s="2">Importer Zotero</li><li data-s="3">Connecter Claude</li><li data-s="4">C’est prêt</li></ol>
    <div class="dlg-body" id="setupBody"></div>`;
  document.body.append(d);
  d.showModal();
  let running = false;
  const close = async (done) => {
    if (running && !confirm('L’import est en cours. Le fermer l’interrompt (tu pourras le reprendre plus tard, sans doublons). Fermer ?')) return;
    running = false;
    if (done) await api('/api/setup', { method: 'PUT', body: { done: true } }).catch(() => {});
    d.close();
    d.remove();
    onDone();
  };
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(false);
  });
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) close(false);
  });
  const body = $('#setupBody', d);
  const step = (n) => $$('.setup-steps li', d).forEach((li) => li.classList.toggle('on', Number(li.dataset.s) === n));

  function welcome() {
    step(1);
    body.innerHTML = `<div class="setup-hero">
      <p class="lead">Ta bibliothèque est en ligne, sur ton propre compte. En trois étapes :</p>
      <ol class="setup-list">
        <li><b>Importer Zotero</b> : tes références, tes PDF et tes surlignages. Zotero reste ton outil, rien n’y est modifié.</li>
        <li><b>Connecter Claude</b> : il pourra chercher dans tes PDF et citer avec des liens vers le passage exact.</li>
        <li><b>Lire et annoter</b> partout, depuis n’importe quel navigateur.</li>
      </ol>
      <p class="note">Ton dossier Zotero est lu dans ce navigateur. Seuls les éléments que tu choisis sont envoyés, et uniquement vers ta bibliothèque.</p>
      <div class="row"><button class="btn primary big" data-go="zotero">Importer ma bibliothèque Zotero</button><button class="btn" data-go="claude">Passer : je n’utilise pas Zotero</button></div>
    </div>`;
  }

  function zoteroPick() {
    step(2);
    body.innerHTML = `<div class="setup-zot">
      <h3>1. Choisis ton dossier Zotero</h3>
      <p>C’est le dossier qui contient le fichier <code class="inline">zotero.sqlite</code> et le dossier <code class="inline">storage</code>. Pour le trouver : dans Zotero, <b>Réglages › Avancé › Fichiers et dossiers › Ouvrir le répertoire de données</b>. En général :</p>
      <ul class="note"><li>Mac : dossier <b>Zotero</b> dans ton dossier personnel</li><li>Windows : <b>C:\\Users\\ton-nom\\Zotero</b></li></ul>
      <p class="note">Ferme Zotero avant, pour une lecture plus sûre. Le navigateur peut te demander de confirmer l’« envoi » de nombreux fichiers : ils sont seulement lus ici.</p>
      <label class="btn primary big file-btn">Choisir le dossier Zotero<input type="file" webkitdirectory directory multiple hidden data-zdir></label>
      <div data-zstatus></div>
    </div>`;
    $('[data-zdir]', body).addEventListener('change', (e) => loadZotero([...e.target.files]));
  }

  let Z = null;
  let extraFiles = [];
  async function loadZotero(files) {
    const status = $('[data-zstatus]', body);
    const db = files.find((f) => /(^|\/)zotero\.sqlite$/.test(f.webkitRelativePath || f.name)) || files.find((f) => /zotero\.sqlite\.bak$/.test(f.webkitRelativePath || f.name));
    if (!db) {
      status.innerHTML = '<p class="err-box">Pas de fichier <b>zotero.sqlite</b> dans ce dossier. Choisis le dossier de données de Zotero (voir ci-dessus).</p>';
      return;
    }
    status.innerHTML = '<p class="note">Lecture de la base Zotero…</p>';
    try {
      Z = await readZotero(db, files);
    } catch (err) {
      status.innerHTML = `<p class="err-box">Lecture impossible : ${esc(err.message)}. Ferme Zotero et réessaie.</p>`;
      return;
    }
    zoteroChoose();
  }

  function zoteroChoose() {
    indexLinked();
    const cols = Z.topCollections;
    body.innerHTML = `<div class="setup-zot">
      <h3>2. Que veux-tu importer ?</h3>
      <p class="note">${nf(Z.items.length)} références dans Zotero, dont ${nf(Z.withPdf)} avec un PDF trouvé dans le dossier${Z.linked ? ` et ${nf(Z.linked)} avec un PDF « lié » rangé ailleurs` : ''}${Z.annotations ? `, ${nf(Z.annotations)} surlignages et notes` : ''}.</p>
      <div class="zcols">
        <label class="zcol all"><input type="checkbox" data-zall checked> <b>Toute la bibliothèque</b> <span class="n">${nf(Z.items.length)}</span></label>
        ${cols.map((c) => `<label class="zcol"><input type="checkbox" data-zcol="${c.id}" checked> ${esc(c.name)} <span class="n">${nf(c.count)}</span></label>`).join('')}
        ${Z.unfiled ? `<label class="zcol"><input type="checkbox" data-zunfiled checked> <i>Références hors collection</i> <span class="n">${nf(Z.unfiled)}</span></label>` : ''}
      </div>
      <div class="zopts">
        <label><input type="checkbox" data-zpdf checked> Envoyer les PDF</label>
        <label><input type="checkbox" data-zann checked ${Z.annotations ? '' : 'disabled'}> Reprendre les surlignages et notes de Zotero</label>
      </div>
      ${Z.linked ? `<div class="zlinked"><p><b>PDF liés :</b> ${nf(Z.linked)} PDF sont rangés hors du dossier Zotero (ZotFile, dossier synchronisé…). Pour les inclure, choisis aussi ce dossier :</p>
        <label class="btn file-btn">Choisir le dossier des PDF liés<input type="file" webkitdirectory directory multiple hidden data-zlink></label> <span class="note" data-zlinkstat></span></div>` : ''}
      <p class="lead" data-zsum></p>
      <div class="row"><button class="btn primary big" data-zgo>Importer</button><button class="btn" data-go="claude">Passer cette étape</button></div>
      <p class="note">Tu peux relancer l’import plus tard (menu ⋯ › Assistant de démarrage) : ce qui est déjà importé est reconnu, sans doublons.</p>
    </div>`;
    const sum = () => {
      const sel = selection();
      const pdfs = sel.filter((it) => it.pdf || (it.linkedName && findLinked(it.linkedName))).length;
      $('[data-zsum]', body).textContent = `${nf(sel.length)} références sélectionnées, ${nf(pdfs)} avec PDF.`;
    };
    body.addEventListener('change', (e) => {
      if (e.target.matches('[data-zall]')) $$('[data-zcol], [data-zunfiled]', body).forEach((c) => (c.checked = e.target.checked));
      else if (e.target.matches('[data-zcol], [data-zunfiled]')) $('[data-zall]', body).checked = $$('[data-zcol], [data-zunfiled]', body).every((c) => c.checked);
      if (e.target.matches('[data-zlink]')) {
        extraFiles = [...e.target.files].filter((f) => /\.pdf$/i.test(f.name));
        indexLinked();
        $('[data-zlinkstat]', body).textContent = `${nf(extraFiles.length)} PDF trouvés dans ce dossier.`;
      }
      sum();
    });
    sum();
    $('[data-zgo]', body).addEventListener('click', () => runImport({ pdf: $('[data-zpdf]', body).checked, ann: $('[data-zann]', body).checked }));
  }

  let linkedIndex = new Map();
  function indexLinked() {
    linkedIndex = new Map();
    for (const f of [...extraFiles, ...Z.allPdfFiles]) {
      const k = f.name.normalize('NFC').toLowerCase();
      if (!linkedIndex.has(k)) linkedIndex.set(k, f);
    }
  }
  const findLinked = (name) => linkedIndex.get(String(name).normalize('NFC').toLowerCase()) || null;

  function selection() {
    const all = $('[data-zall]', body)?.checked;
    if (all) return Z.items;
    const cols = new Set($$('[data-zcol]', body).filter((c) => c.checked).map((c) => Number(c.dataset.zcol)));
    const unfiled = $('[data-zunfiled]', body)?.checked;
    return Z.items.filter((it) => it.tops.some((t) => cols.has(t)) || (unfiled && !it.tops.length));
  }

  async function runImport({ pdf, ann }) {
    const list = selection();
    const selectedTops = new Set($('[data-zall]', body).checked ? Z.topCollections.map((c) => c.id) : $$('[data-zcol]', body).filter((c) => c.checked).map((c) => Number(c.dataset.zcol)));
    const health = await api('/api/setup');
    running = true;
    const S = { done: 0, created: 0, dup: 0, known: 0, pdfs: 0, anns: 0, indexed: 0, errors: [] };
    body.innerHTML = `<div class="setup-zot">
      <h3>3. Import en cours</h3>
      <p class="note">Garde cet onglet ouvert. Tu peux ouvrir la bibliothèque dans un autre onglet pendant ce temps.</p>
      <div class="zbar"><i data-zbar></i></div>
      <div class="zstats" data-zstats></div>
      <p class="note zcur" data-zcur></p>
      <details class="zerrs hidden" data-zerrs><summary>Problèmes</summary><ul></ul></details>
      <div class="row hidden" data-zend><button class="btn primary big" data-go="claude">Étape suivante : connecter Claude</button></div>
    </div>`;
    const known = new Map((await api('/api/zotero/keys')).items.map((r) => [r.zotero_key, r]));
    const indexQueue = [];
    const draw = () => {
      $('[data-zbar]', body).style.width = `${Math.round((100 * S.done) / Math.max(1, list.length))}%`;
      $('[data-zstats]', body).innerHTML = `<span><b>${nf(S.done)}</b> / ${nf(list.length)} références traitées</span><span><b>${nf(S.created)}</b> créées</span>${S.dup ? `<span><b>${nf(S.dup)}</b> déjà présentes (complétées)</span>` : ''}${S.known ? `<span><b>${nf(S.known)}</b> déjà importées</span>` : ''}<span><b>${nf(S.pdfs)}</b> PDF envoyés</span>${ann ? `<span><b>${nf(S.anns)}</b> surlignages</span>` : ''}<span><b>${nf(S.indexed)}</b> PDF indexés${health.server_extract ? '' : ' (à la fin)'}</span>`;
    };
    const fail = (it, msg) => {
      S.errors.push(`${it.data.title.slice(0, 70)} : ${msg}`);
      const box = $('[data-zerrs]', body);
      box.classList.remove('hidden');
      box.querySelector('ul').insertAdjacentHTML('beforeend', `<li>${esc(it.data.title.slice(0, 70))} : ${esc(msg)}</li>`);
    };
    draw();

    async function one(it) {
      if (!running) return;
      $('[data-zcur]', body).textContent = it.data.title.slice(0, 110);
      const data = { ...it.data, collections: it.collectionNames(selectedTops) };
      let id;
      let hasPdf = false;
      const k = known.get(it.key);
      if (k) {
        id = k.id;
        hasPdf = !!k.has_pdf;
        S.known++;
        if (hasPdf || !pdf) return;
      } else {
        const r = await api('/api/items', { method: 'POST', body: data });
        id = r.item.id;
        hasPdf = !!r.item.has_pdf;
        if (r.duplicate) {
          S.dup++;
          const patch = { collections: [...new Set([...(r.item.collections || []), ...data.collections])], tags: [...new Set([...(r.item.tags || []), ...(data.tags || [])])] };
          for (const f of ['abstract', 'doi', 'url', 'container', 'volume', 'issue', 'pages', 'publisher']) if (!r.item[f] && data[f]) patch[f] = data[f];
          await api(`/api/items/${id}`, { method: 'PATCH', body: patch });
        } else S.created++;
        await api(`/api/items/${id}/zotero`, { method: 'POST', body: { key: it.key } });
      }
      if (!pdf || hasPdf) return;
      const file = it.pdf || (it.linkedName ? findLinked(it.linkedName) : null);
      if (!file) return;
      if (file.size > MAX_UPLOAD) return fail(it, `PDF trop lourd (${Math.round(file.size / 1048576)} Mo)`);
      const r = await fetch(`/api/items/${id}/pdf`, { method: 'PUT', body: file, headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(file.name) } });
      if (!r.ok) return fail(it, `PDF refusé (${(await r.json().catch(() => ({}))).error || r.status})`);
      S.pdfs++;
      if (ann && it.annotations.length) {
        for (const a of it.annotations) {
          try {
            await api(`/api/items/${id}/annotations`, { method: 'POST', body: a });
            S.anns++;
          } catch (e) {
            void e;
          }
        }
      }
      indexQueue.push({ id, it });
    }

    // indexation sur le serveur, en parallèle des envois
    let uploading = true;
    const indexer = async () => {
      if (!health.server_extract) return;
      for (;;) {
        const job = indexQueue.shift();
        if (!job) {
          if (!uploading || !running) return;
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        try {
          await api(`/api/items/${job.id}/index`, { method: 'POST' });
          S.indexed++;
        } catch (e) {
          if (!/déjà en cours/.test(e.message)) fail(job.it, `indexation : ${e.message} (elle sera reprise automatiquement)`);
        }
        draw();
      }
    };
    const indexers = [indexer(), indexer()];
    const queue = [...list];
    const worker = async () => {
      for (;;) {
        const it = queue.shift();
        if (!it || !running) return;
        try {
          await one(it);
        } catch (e) {
          fail(it, e.message);
        }
        S.done++;
        draw();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    uploading = false;
    $('[data-zcur]', body).textContent = indexQueue.length ? 'Indexation du texte des derniers PDF…' : '';
    await Promise.all(indexers);
    running = false;
    draw();
    $('[data-zcur]', body).textContent = '';
    body.querySelector('h3').textContent = 'Import terminé';
    $('[data-zend]', body).classList.remove('hidden');
    if (!health.server_extract && processPending) processPending();
    toast(`Import Zotero : ${nf(S.created)} références créées, ${nf(S.pdfs)} PDF.`);
  }

  async function claude() {
    step(3);
    body.innerHTML = `<h3>Connecter Claude à ta bibliothèque</h3>${await connectorHtml()}
      <div class="row"><button class="btn primary big" data-go="done">C’est fait</button><button class="btn" data-go="done">Plus tard</button></div>
      <p class="note">Tu retrouveras ces explications dans le menu ⋯ › Connecter à Claude.</p>`;
    bindConnector(body);
  }

  function done() {
    step(4);
    body.innerHTML = `<div class="setup-hero"><p class="lead">Ta bibliothèque est prête.</p>
      <ul class="setup-list">
        <li><b>Lire et annoter</b> : ouvre une référence, puis « Lire et annoter ». Sélectionne du texte pour surligner, clique un surlignage pour le commenter.</li>
        <li><b>Chercher</b> dans le texte de tous tes PDF avec la barre du haut, par mots ou par le sens.</li>
        <li><b>Citer avec Claude</b> : ses réponses contiennent des liens qui ouvrent le passage exact. Ils fonctionnent aussi dans Word, Notion ou un courriel.</li>
        <li><b>Ajouter</b> de nouveaux articles avec « + Ajouter » : PDF glissé, DOI, fichier RIS ou page web.</li>
      </ul>
      <div class="row"><button class="btn primary big" data-go="finish">Ouvrir ma bibliothèque</button></div></div>`;
  }

  body.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]')?.dataset.go;
    if (!g) return;
    if (g === 'zotero') zoteroPick();
    if (g === 'claude') claude().catch((err) => toast(err.message, 'err'));
    if (g === 'done') done();
    if (g === 'finish') close(true);
  });
  welcome();
}

// ---------- lecture de la base Zotero (sql.js, dans le navigateur) ----------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Chargement de sql.js impossible (connexion ?)'));
    document.head.append(s);
  });
}

const TYPE_MAP = {
  journalArticle: 'article', magazineArticle: 'article', newspaperArticle: 'article', preprint: 'article',
  book: 'book', bookSection: 'chapter', encyclopediaArticle: 'chapter', dictionaryEntry: 'chapter',
  report: 'report', thesis: 'thesis', conferencePaper: 'conference', webpage: 'web', blogPost: 'web', forumPost: 'web',
};
const AUTHOR_TYPES = new Set(['author', 'presenter', 'director', 'podcaster', 'interviewee', 'contributor', 'programmer', 'artist', 'performer', 'producer', 'cartographer']);
const EDITOR_TYPES = new Set(['editor', 'seriesEditor', 'bookAuthor']);

// couleurs de Zotero → les quatre couleurs du lecteur
function colorOf(hex) {
  const h = String(hex || '').toLowerCase();
  if (['#5fb236'].includes(h)) return 'green';
  if (['#2ea8e5', '#a28ae5'].includes(h)) return 'blue';
  if (['#ff6666', '#e56eee'].includes(h)) return 'pink';
  return 'yellow';
}
const stripHtml = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();

async function readZotero(dbFile, files) {
  if (!window.initSqlJs) await loadScript(`${SQLJS}sql-wasm.js`);
  const SQL = await window.initSqlJs({ locateFile: (f) => `${SQLJS}${f}` });
  const db = new SQL.Database(new Uint8Array(await dbFile.arrayBuffer()));
  const q = (sql, params = []) => {
    const st = db.prepare(sql);
    st.bind(params);
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  };
  const has = (table) => q("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]).length > 0;

  // fichiers du dossier choisi : chemin relatif sans le nom du dossier racine
  const root = (dbFile.webkitRelativePath || '').split('/')[0];
  const byPath = new Map();
  const allPdfFiles = [];
  for (const f of files) {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(root ? 1 : 0).join('/').normalize('NFC');
    byPath.set(rel, f);
    if (/\.pdf$/i.test(f.name)) allPdfFiles.push(f);
  }

  const cols = q('SELECT collectionID AS id, collectionName AS name, parentCollectionID AS parent FROM collections');
  const parent = new Map(cols.map((c) => [c.id, c.parent]));
  const cname = new Map(cols.map((c) => [c.id, c.name]));
  const top = (id) => {
    let c = id;
    for (let guard = 0; parent.get(c) && guard < 50; guard++) c = parent.get(c);
    return c;
  };
  const deleted = new Set(has('deletedItems') ? q('SELECT itemID FROM deletedItems').map((r) => r.itemID) : []);
  const fieldName = new Map(q('SELECT fieldID, fieldName FROM fields').map((r) => [r.fieldID, r.fieldName]));
  const inCols = new Map();
  for (const r of q('SELECT collectionID, itemID FROM collectionItems')) {
    if (!inCols.has(r.itemID)) inCols.set(r.itemID, []);
    inCols.get(r.itemID).push(r.collectionID);
  }
  const fieldsOf = new Map();
  for (const r of q('SELECT d.itemID, d.fieldID, v.value FROM itemData d JOIN itemDataValues v ON v.valueID = d.valueID')) {
    if (!fieldsOf.has(r.itemID)) fieldsOf.set(r.itemID, {});
    fieldsOf.get(r.itemID)[fieldName.get(r.fieldID)] = r.value;
  }
  const creatorsOf = new Map();
  for (const r of q('SELECT ic.itemID, c.firstName, c.lastName, c.fieldMode, ct.creatorType FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID ORDER BY ic.itemID, ic.orderIndex')) {
    if (!creatorsOf.has(r.itemID)) creatorsOf.set(r.itemID, []);
    creatorsOf.get(r.itemID).push(r);
  }
  const tagsOf = new Map();
  for (const r of q('SELECT it.itemID, t.name FROM itemTags it JOIN tags t ON t.tagID = it.tagID WHERE it.type = 0')) {
    if (!tagsOf.has(r.itemID)) tagsOf.set(r.itemID, []);
    tagsOf.get(r.itemID).push(r.name);
  }
  const attsOf = new Map();
  for (const r of q("SELECT a.itemID, a.parentItemID, a.linkMode, a.path, i.key FROM itemAttachments a JOIN items i ON i.itemID = a.itemID WHERE a.contentType = 'application/pdf' AND a.parentItemID IS NOT NULL ORDER BY a.itemID")) {
    if (deleted.has(r.itemID)) continue;
    if (!attsOf.has(r.parentItemID)) attsOf.set(r.parentItemID, []);
    attsOf.get(r.parentItemID).push(r);
  }
  const annsOf = new Map();
  let nAnn = 0;
  if (has('itemAnnotations')) {
    for (const r of q('SELECT a.itemID, a.parentItemID, a.type, a.text, a.comment, a.color, a.position FROM itemAnnotations a ORDER BY a.parentItemID, a.sortIndex')) {
      if (deleted.has(r.itemID)) continue;
      let pos = {};
      try {
        pos = JSON.parse(r.position || '{}');
      } catch {}
      const page = (Number(pos.pageIndex) || 0) + 1;
      let a = null;
      if ((r.type === 1 || r.type === 5) && r.text) a = { page, quote: String(r.text).slice(0, 4000), comment: r.comment || null, color: colorOf(r.color), kind: 'highlight' };
      else if ((r.type === 2 || r.type === 6) && r.comment) a = { page, comment: String(r.comment).slice(0, 10000), color: colorOf(r.color), kind: 'note' };
      if (!a) continue;
      if (!annsOf.has(r.parentItemID)) annsOf.set(r.parentItemID, []);
      annsOf.get(r.parentItemID).push(a);
    }
  }
  const notesOf = new Map();
  if (has('itemNotes')) {
    for (const r of q('SELECT itemID, parentItemID, note FROM itemNotes WHERE parentItemID IS NOT NULL')) {
      if (deleted.has(r.itemID)) continue;
      if (!notesOf.has(r.parentItemID)) notesOf.set(r.parentItemID, []);
      notesOf.get(r.parentItemID).push(stripHtml(r.note));
    }
  }

  const items = [];
  const topCount = new Map();
  let unfiled = 0;
  let withPdf = 0;
  let linked = 0;
  let annotations = 0;
  for (const r of q('SELECT i.itemID, i.key, t.typeName FROM items i JOIN itemTypes t ON t.itemTypeID = i.itemTypeID')) {
    if (['attachment', 'note', 'annotation'].includes(r.typeName) || deleted.has(r.itemID)) continue;
    const f = fieldsOf.get(r.itemID) || {};
    const authors = [];
    const editors = [];
    for (const c of creatorsOf.get(r.itemID) || []) {
      const p = c.fieldMode === 1 || !c.firstName ? { literal: c.lastName } : { family: c.lastName, given: c.firstName };
      if (EDITOR_TYPES.has(c.creatorType)) editors.push(p);
      else if (AUTHOR_TYPES.has(c.creatorType)) authors.push(p);
    }
    const doi = f.DOI || ((f.extra || '').match(/^DOI:\s*(\S+)/im) || [])[1] || null;
    const year = ((f.date || '').match(/\d{4}/) || [])[0] || null;
    const colIds = inCols.get(r.itemID) || [];
    const tops = [...new Set(colIds.map(top))];
    const subs = [...new Set(colIds.filter((c) => top(c) !== c).map((c) => cname.get(c)))];
    if (!tops.length) unfiled++;
    for (const t of tops) topCount.set(t, (topCount.get(t) || 0) + 1);
    // PDF : d'abord une pièce jointe stockée par Zotero, sinon un fichier lié
    let pdf = null;
    let linkedName = null;
    let pdfAtt = null;
    for (const a of attsOf.get(r.itemID) || []) {
      if (!a.path) continue;
      if ((a.linkMode === 0 || a.linkMode === 1) && a.path.startsWith('storage:')) {
        const file = byPath.get(`storage/${a.key}/${a.path.slice(8)}`.normalize('NFC'));
        if (file) {
          pdf = file;
          pdfAtt = a;
          break;
        }
      } else if (a.linkMode === 2 && !linkedName) {
        linkedName = a.path.split(/[\\/:]/).pop();
        pdfAtt = pdfAtt || a;
      }
    }
    if (pdf) withPdf++;
    else if (linkedName) linked++;
    const anns = pdfAtt ? annsOf.get(pdfAtt.itemID) || [] : [];
    annotations += anns.length;
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
    const notes = (notesOf.get(r.itemID) || []).filter(Boolean).join('\n\n').slice(0, 10000);
    items.push({
      key: r.key,
      tops,
      pdf,
      linkedName: pdf ? null : linkedName,
      annotations: anns,
      data: clean({
        item_type: TYPE_MAP[r.typeName] || 'other',
        title: f.title || f.caseName || '(sans titre)',
        authors, editors, year,
        container: f.publicationTitle || f.bookTitle || f.proceedingsTitle || f.websiteTitle || f.blogTitle || f.repository || f.programTitle || f.encyclopediaTitle,
        volume: f.volume, issue: f.issue, pages: f.pages,
        publisher: f.publisher || f.institution || f.university || f.studio || f.label,
        place: f.place, doi, url: f.url, isbn: f.ISBN, abstract: f.abstractNote, language: f.language,
        tags: [...new Set([...(tagsOf.get(r.itemID) || []), ...subs])],
        note: notes || null,
        meta_source: 'zotero',
      }),
      collectionNames(selectedTops) {
        return tops.filter((t) => selectedTops.has(t)).map((t) => cname.get(t));
      },
    });
  }
  db.close();
  const topCollections = cols.filter((c) => !c.parent && topCount.get(c.id)).map((c) => ({ id: c.id, name: c.name, count: topCount.get(c.id) })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { items, topCollections, unfiled, withPdf, linked, annotations, allPdfFiles };
}
