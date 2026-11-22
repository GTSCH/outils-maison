// Page d'accueil de Passages : illustration, puis installation pas à pas sur le compte Cloudflare de la personne.
// La clé Cloudflare reste dans la page le temps de l'installation : elle n'est jamais enregistrée dans le navigateur.

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- illustration : la citation ouvre le passage ----------
const cite = $('#demoCite');
const pdf = $('#demoPdf');
function showPassage(open) {
  pdf.classList.toggle('open', open);
  cite.setAttribute('aria-pressed', String(open));
}
cite.addEventListener('click', () => showPassage(!pdf.classList.contains('open')));
setTimeout(() => { if (cite.getAttribute('aria-pressed') === 'false') showPassage(true); }, 1400);

// ---------- étapes ----------
const ORDER = ['s1', 's2', 's3', 's4', 's5'];
function setStep(id, { scroll = true } = {}) {
  const at = ORDER.indexOf(id);
  ORDER.forEach((s, i) => {
    const el = document.getElementById(s);
    el.classList.toggle('done', i < at);
    el.classList.toggle('current', i === at);
    el.classList.toggle('locked', i > at);
    el.inert = i > at;
  });
  if (scroll) document.getElementById(id).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
setStep('s1', { scroll: false });
document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.next)));
$('#s1 a[href*="sign-up"]').addEventListener('click', () => setTimeout(() => setStep('s2', { scroll: false }), 400));

// ---------- étape 2 : la clé ----------
const PERMISSIONS = [
  { key: 'workers_scripts', type: 'edit' },
  { key: 'd1', type: 'edit' },
  { key: 'workers_r2', type: 'edit' },
  { key: 'workers_kv_storage', type: 'edit' },
  { key: 'vectorize', type: 'edit' },
  { key: 'account_settings', type: 'read' },
];
$('#tokenLink').href = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=' + encodeURIComponent(JSON.stringify(PERMISSIONS)) + '&accountId=*&zoneId=all&name=' + encodeURIComponent('Installation Passages');

const state = { token: '', account: null, accounts: [] };
const tokenInput = $('#token');
const verifyBtn = $('#verify');
const verifyOut = $('#verifyOut');

const LABELS = {
  workers: 'Programmes (Workers Scripts)',
  d1: 'Base de données (D1)',
  r2: 'Stockage des PDF (R2)',
  kv: 'Stockage de secours (Workers KV)',
  vectorize: 'Recherche par le sens (Vectorize)',
};
function checkLines(acc) {
  const c = acc.checks;
  const lines = [];
  const line = (cls, text) => lines.push(`<li class="${cls}">${text}</li>`);
  line(c.workers === 'ok' ? 'ok' : 'err', c.workers === 'ok' ? LABELS.workers : `${LABELS.workers} : droit manquant`);
  line(c.d1 === 'ok' ? 'ok' : 'err', c.d1 === 'ok' ? LABELS.d1 : `${LABELS.d1} : droit manquant`);
  if (c.r2 === 'ok') line('ok', `${LABELS.r2}, en Europe`);
  else if (c.r2 === 'disabled') line(c.kv === 'ok' ? 'warn' : 'err', `R2 n’est pas encore activé sur ce compte. ${c.kv === 'ok' ? 'Les PDF iront dans Workers KV (25 Mo au plus par fichier). ' : ''}Pour l’activer : tableau de bord Cloudflare › R2 › Activer (gratuit jusqu’à 10 Go, une carte bancaire est demandée).`);
  else line(c.kv === 'ok' ? 'warn' : 'err', `${LABELS.r2} : droit manquant${c.kv === 'ok' ? ', les PDF iront dans Workers KV (25 Mo au plus par fichier)' : ''}`);
  if (c.r2 !== 'ok') line(c.kv === 'ok' ? 'ok' : 'err', c.kv === 'ok' ? LABELS.kv : `${LABELS.kv} : droit manquant`);
  line(c.vectorize === 'ok' ? 'ok' : 'warn', c.vectorize === 'ok' ? LABELS.vectorize : `${LABELS.vectorize} : droit manquant. La recherche marchera par mots-clés seulement. Pour l’avoir, recrée la clé avec Vectorize en Edit.`);
  return lines.join('');
}
const usable = (a) => a.checks.workers === 'ok' && a.checks.d1 === 'ok' && (a.checks.r2 === 'ok' || a.checks.kv === 'ok');

function chooseAccount(acc) {
  state.account = acc;
  $('#sub').textContent = acc.subdomain || 'adresse-créée-à-l’installation';
  updateNameHint();
}

function renderVerify(res) {
  if (!res.accounts?.length) {
    verifyOut.innerHTML = `<p class="msg err">${esc(res.message || 'Clé refusée par Cloudflare.')}</p>`;
    return false;
  }
  state.accounts = res.accounts;
  const ok = res.accounts.filter(usable);
  const blocks = res.accounts.map((a, i) => {
    const pick = ok.length > 1 && usable(a) ? `<label class="row"><input type="radio" name="acc" value="${i}" ${a === ok[0] ? 'checked' : ''}> <b>${esc(a.name)}</b></label>` : (res.accounts.length > 1 ? `<b>${esc(a.name)}</b>` : '');
    return `${pick}<ul class="checks">${checkLines(a)}</ul>`;
  }).join('');
  const head = ok.length
    ? `<p class="msg"><b>Clé valide.</b>${ok.length > 1 ? ' Choisis le compte où installer ta bibliothèque.' : ''}</p>`
    : '<p class="msg err">Il manque des droits à cette clé (lignes en rouge). Recrée-la depuis le bouton ci-dessus, puis colle la nouvelle.</p>';
  verifyOut.innerHTML = head + blocks + (ok.length ? '<div class="row"><button class="btn small" id="toS3">Continuer</button></div>' : '');
  if (ok.length) {
    chooseAccount(ok[0]);
    verifyOut.querySelectorAll('input[name=acc]').forEach((r) => r.addEventListener('change', () => chooseAccount(state.accounts[Number(r.value)])));
    $('#toS3').addEventListener('click', () => { setStep('s3'); $('#name').focus({ preventScroll: true }); });
  }
  return ok.length > 0;
}

verifyBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    verifyOut.innerHTML = '<p class="msg err">Colle d’abord ta clé dans le champ.</p>';
    tokenInput.focus();
    return;
  }
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Vérification…';
  verifyOut.innerHTML = '';
  try {
    const r = await fetch('/api/verifier', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    const res = await r.json();
    state.token = token;
    renderVerify(res);
  } catch (e) {
    verifyOut.innerHTML = `<p class="msg err">La vérification n’a pas abouti (${esc(e.message)}). Vérifie ta connexion et réessaie.</p>`;
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Vérifier la clé';
  }
});
tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyBtn.click(); });

// ---------- étape 3 : adresse et mot de passe ----------
const nameInput = $('#name');
const pwInput = $('#password');
const installBtn = $('#install');
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40);
const s3msg = document.createElement('p');
s3msg.className = 'msg';
installBtn.parentElement.before(s3msg);
const pwField = pwInput.closest('.field');

function mode() {
  const n = slug(nameInput.value).replace(/-+$/, '');
  if (!state.account) return { n, kind: 'new' };
  if (state.account.libraries?.includes(n)) return { n, kind: 'update' };
  if (state.account.scripts?.includes(n)) return { n, kind: 'taken' };
  return { n, kind: 'new' };
}
function updateNameHint() {
  const m = mode();
  s3msg.classList.remove('err');
  pwField.hidden = m.kind === 'update';
  if (m.kind === 'update') s3msg.innerHTML = `<b>« ${esc(m.n)} » est déjà installée sur ce compte.</b> L’installateur mettra seulement le programme à jour : tes références, tes PDF, tes annotations et ton mot de passe restent.`;
  else if (m.kind === 'taken') { s3msg.classList.add('err'); s3msg.textContent = `Un autre programme s’appelle déjà « ${m.n} » sur ce compte. Choisis un autre nom.`; }
  else s3msg.textContent = '';
  installBtn.textContent = m.kind === 'update' ? 'Mettre à jour ma bibliothèque' : 'Installer ma bibliothèque';
}
nameInput.addEventListener('input', () => {
  const pos = nameInput.selectionStart;
  const v = slug(nameInput.value);
  if (v !== nameInput.value) { nameInput.value = v; try { nameInput.setSelectionRange(pos, pos); } catch {} }
  updateNameHint();
});
nameInput.addEventListener('change', () => { nameInput.value = slug(nameInput.value).replace(/-+$/, ''); updateNameHint(); });

function validate() {
  const m = mode();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(m.n)) return 'Le nom doit compter 3 à 40 caractères : lettres sans accents, chiffres et tirets, sans tiret au début ni à la fin.';
  if (m.kind === 'taken') return `Un autre programme s’appelle déjà « ${m.n} » sur ce compte. Choisis un autre nom.`;
  if (m.kind === 'new' && pwInput.value.length < 10) return 'Le mot de passe doit compter 10 caractères au moins.';
  if (!state.token || !state.account) return 'Vérifie d’abord ta clé à l’étape 2.';
  return '';
}

// ---------- étape 4 : installation ----------
const log = $('#log');
const SYMBOL = { run: '…', ok: '✓', warn: '!', err: '✗' };
function logLine(step, status, message) {
  let li = step !== 'fin' && step !== 'cron' ? log.querySelector(`li[data-step="${step}"]`) : null;
  if (!li) {
    li = document.createElement('li');
    li.dataset.step = step;
    li.innerHTML = '<span class="s"></span><span class="t"></span>';
    log.append(li);
  }
  li.className = status;
  li.querySelector('.s').textContent = SYMBOL[status] || '·';
  li.querySelector('.t').textContent = message;
}

installBtn.addEventListener('click', async () => {
  const problem = validate();
  if (problem) {
    s3msg.classList.add('err');
    s3msg.textContent = problem;
    return;
  }
  const m = mode();
  installBtn.disabled = true;
  log.innerHTML = '';
  setStep('s4');
  logLine('start', 'run', m.kind === 'update' ? 'Mise à jour en cours, cela prend environ une minute.' : 'Installation en cours, cela prend une à deux minutes. Garde cette page ouverte.');
  let result = null;
  let failed = '';
  try {
    const r = await fetch('/api/installer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: state.token, account_id: state.account.id, name: m.n, password: m.kind === 'update' ? '' : pwInput.value, email: $('#email').value.trim() }),
    });
    if (!r.ok || !r.body) throw new Error(`réponse ${r.status}`);
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const raw = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!raw) continue;
        let ev;
        try { ev = JSON.parse(raw); } catch { continue; }
        if (ev.step === 'fin') {
          if (ev.status === 'ok') result = ev.result;
          else failed = ev.message;
        } else logLine(ev.step, ev.status, ev.message);
      }
    }
    if (!result && !failed) failed = 'la connexion avec l’installateur a été coupée avant la fin.';
  } catch (e) {
    failed = `la connexion avec l’installateur a échoué (${e.message}).`;
  }
  const start = log.querySelector('li[data-step="start"]');
  if (failed) {
    start?.remove();
    log.querySelectorAll('li.run').forEach((li) => { li.className = 'err'; li.querySelector('.s').textContent = SYMBOL.err; });
    logLine('fin', 'err', `Installation interrompue : ${failed}`);
    const retry = document.createElement('li');
    retry.innerHTML = '<span class="s"></span><span class="t">Tu peux corriger puis relancer : ce qui est déjà créé est réutilisé. <button class="btn small quiet" type="button">Revenir à l’étape 3</button></span>';
    retry.querySelector('button').addEventListener('click', () => { installBtn.disabled = false; setStep('s3'); });
    log.append(retry);
    return;
  }
  start?.remove();
  // la clé et le mot de passe ne servent plus : on les retire de la page
  tokenInput.value = '';
  pwInput.value = '';
  state.token = '';
  showDone(result);
});

// ---------- étape 5 : c'est prêt ----------
const done = $('#done');
function copyButton(text, label = 'Copier') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small quiet';
  b.textContent = label;
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copié'; } catch { b.textContent = 'Sélectionne et copie à la main'; }
    setTimeout(() => { b.textContent = label; }, 2000);
  });
  return b;
}

async function showDone(res) {
  setStep('s5');
  const url = res.url;
  done.innerHTML = `
    <p id="readyMsg">${res.update ? 'Mise à jour installée.' : 'Ta bibliothèque est installée.'} <span class="soft">Cloudflare ouvre ton adresse, cela peut prendre une ou deux minutes la première fois…</span></p>
    <div class="result"><div class="soft">Ton adresse, à garder dans tes favoris</div><div class="row"><code>${esc(url)}</code><span id="copyUrl"></span></div></div>
    <div class="row"><a class="btn" id="openLib" href="${esc(url)}" target="_blank" rel="noopener" aria-disabled="true">Ouvrir ma bibliothèque</a></div>
    ${res.update ? '<p>Recharge ta bibliothèque si elle est déjà ouverte : la nouvelle version s’affiche.</p>' : `
    <h3 style="margin-top:22px">Ensuite</h3>
    <ol>
      <li>Ouvre ta bibliothèque et entre ton mot de passe.</li>
      <li>L’assistant de démarrage s’ouvre : choisis ton dossier Zotero (dans Zotero : Réglages › Avancé › Fichiers et dossiers › Répertoire de données). Tes collections, tes PDF et tes surlignages arrivent.</li>
      <li>L’assistant te montre ensuite comment relier Claude, avec l’adresse de ton connecteur.</li>
    </ol>`}
    ${res.mcp ? `<div class="result"><div class="soft">Adresse de ton connecteur Claude. Elle donne accès à ta bibliothèque : garde-la pour toi, comme un mot de passe. Tu la retrouves aussi dans le menu de ta bibliothèque.</div><div class="row"><code id="mcpUrl">${esc(res.mcp)}</code><span id="copyMcp"></span></div></div>` : ''}
    ${res.server_extract === false ? '<p class="soft">Ton compte Cloudflare est sur l’offre gratuite : le texte des PDF sera lu dans ton navigateur, à l’import. Avec l’offre Workers à 5 $ par mois, relance l’installation sous le même nom : le serveur s’en chargera.</p>' : ''}
    <h3 style="margin-top:22px">Dernière précaution</h3>
    <p>Supprime la clé d’installation : ta bibliothèque n’en a plus besoin. Sur la page des clés Cloudflare, ligne « Installation Passages », menu ⋯ › Delete.</p>
    <div class="row"><a class="btn small quiet" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener">Ouvrir mes clés Cloudflare</a></div>`;
  $('#copyUrl').append(copyButton(url));
  if (res.mcp) $('#copyMcp').append(copyButton(res.mcp));
  const open = $('#openLib');
  open.style.opacity = '.6';
  // on attend que l'adresse réponde avant d'inviter à l'ouvrir
  for (let i = 0; i < 60; i++) {
    try {
      const r = await (await fetch('/api/pret?url=' + encodeURIComponent(url))).json();
      if (r.ready) break;
    } catch {}
    await sleep(i < 10 ? 3000 : 6000);
  }
  open.style.opacity = '';
  open.removeAttribute('aria-disabled');
  $('#readyMsg').innerHTML = res.update ? '<b>Mise à jour installée.</b>' : '<b>Ta bibliothèque est prête.</b>';
}
