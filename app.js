const CHIAVE = 'scadenze.prodotti.v1';
const CHIAVE_CATALOGO = 'scadenze.catalogo.v1';
const CHIAVE_IMPOSTAZIONI = 'scadenze.impostazioni.v1';
const CHIAVE_AVVISO = 'scadenze.ultimoAvviso';
const CHIAVE_POSIZIONE = 'scadenze.ultimaPosizione';
const SOGLIA_GIORNI = 3;
const LUOGHI_BASE = [
  { id: 'frigo', nome: 'Frigo', icona: '❄️' },
  { id: 'armadio', nome: 'Armadio', icona: '🗄️' },
  { id: 'freezer', nome: 'Freezer', icona: '🧊' },
  { id: 'dispensa', nome: 'Dispensa', icona: '🍝' },
];

let prodotti = caricaJson(CHIAVE, []);
let catalogo = caricaJson(CHIAVE_CATALOGO, []);
let impostazioni = caricaImpostazioni();
let filtro = 'tutti';
let immagineForm = '';
let modificaId = null;

const $ = id => document.getElementById(id);

// --- memoria del browser (localStorage) ---
function caricaJson(chiave, predefinito) {
  try {
    return JSON.parse(localStorage.getItem(chiave)) || predefinito;
  } catch {
    return predefinito;
  }
}

// I luoghi sono fissi: quelli predefiniti, senza possibilità di aggiungerne altri.
function caricaImpostazioni() {
  const salvate = caricaJson(CHIAVE_IMPOSTAZIONI, {});
  return {
    densita: ['compatta', 'normale', 'grande'].includes(salvate.densita) ? salvate.densita : 'normale',
    immagini: salvate.immagini !== false,
    luoghi: LUOGHI_BASE.map(l => ({ ...l })),
    nascosti: Array.isArray(salvate.nascosti)
      ? salvate.nascosti.filter(id => LUOGHI_BASE.some(l => l.id === id)).slice(0, LUOGHI_BASE.length - 1)
      : [],
  };
}

// Un prodotto con un luogo non più presente finisce in Frigo.
function sistemaLuoghiProdotti() {
  prodotti = prodotti.map(p => impostazioni.luoghi.some(l => l.id === p.posizione) ? p : { ...p, posizione: 'frigo' });
}

function salvaImpostazioni() {
  try {
    localStorage.setItem(CHIAVE_IMPOSTAZIONI, JSON.stringify(impostazioni));
  } catch {
    alert('Non riesco a salvare le impostazioni su questo dispositivo.');
  }
}

function salvaTutto() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(prodotti));
    localStorage.setItem(CHIAVE_CATALOGO, JSON.stringify(catalogo));
  } catch {
    alert('Non riesco a salvare i dati su questo dispositivo.');
  }
}

// I luoghi che l'utente ha scelto di mostrare nell'app.
function luoghiVisibili() {
  return impostazioni.luoghi.filter(l => !impostazioni.nascosti.includes(l.id));
}

function ultimaPosizione() {
  const visibili = luoghiVisibili();
  let posizione = visibili[0].id;
  try {
    posizione = localStorage.getItem(CHIAVE_POSIZIONE) || posizione;
  } catch {
    // uso il primo luogo visibile
  }
  return visibili.some(l => l.id === posizione) ? posizione : visibili[0].id;
}

function ricordaPosizione(posizione) {
  try {
    localStorage.setItem(CHIAVE_POSIZIONE, posizione);
  } catch {
    // il luogo viene solo suggerito, non serve salvarlo
  }
}

function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- date e stati ---
function dataIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function giorniAllaScadenza(iso) {
  const [a, m, g] = iso.split('-').map(Number);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, g) - oggi) / 86400000);
}

function statoDi(giorni) {
  if (giorni <= 0) return 'rosso';
  if (giorni <= SOGLIA_GIORNI) return 'giallo';
  return 'verde';
}

function etichetta(giorni) {
  if (giorni < 0) return `Scaduto da ${-giorni} ${-giorni === 1 ? 'giorno' : 'giorni'}`;
  if (giorni === 0) return 'Scade oggi';
  if (giorni === 1) return 'Scade domani';
  return `Scade tra ${giorni} giorni`;
}

function formatData(iso) {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(a, m - 1, g).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function luogoDi(id) {
  return impostazioni.luoghi.find(l => l.id === id) || { id, nome: 'Senza luogo', icona: '📦' };
}

function luogo(posizione) {
  const l = luogoDi(posizione);
  return `${l.icona} ${l.nome}`;
}

function esc(testo) {
  return String(testo ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function normalizza(testo) {
  return String(testo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function miniaturaHtml(immagine) {
  return `<div class="thumb">${immagine ? `<img src="${esc(immagine)}" alt="" loading="lazy" onerror="this.replaceWith('🥫')">` : '🥫'}</div>`;
}

// --- filtri per luogo, costruiti dai luoghi impostati ---
function renderFiltri() {
  if (filtro !== 'tutti' && !luoghiVisibili().some(l => l.id === filtro)) filtro = 'tutti';
  const bottoni = [{ id: 'tutti', etichetta: 'Tutti' }, ...luoghiVisibili().map(l => ({ id: l.id, etichetta: `${l.icona} ${l.nome}` }))];
  $('filtri').innerHTML = bottoni.map(f =>
    `<button type="button" data-filtro="${esc(f.id)}" aria-pressed="${filtro === f.id}">${esc(f.etichetta)}</button>`
  ).join('');
}

function renderSelectLuoghi() {
  $('posizione').innerHTML = luoghiVisibili()
    .map(l => `<option value="${esc(l.id)}">${esc(l.icona)} ${esc(l.nome)}</option>`)
    .join('');
}

// --- lista ---
function prodottiVisibili() {
  return prodotti
    .filter(p => filtro === 'tutti' || p.posizione === filtro)
    .sort((a, b) => a.scadenza.localeCompare(b.scadenza));
}

function cardHtml(p) {
  const giorni = giorniAllaScadenza(p.scadenza);
  return `
    <article class="card ${statoDi(giorni)}" data-id="${esc(p.id)}">
      ${miniaturaHtml(p.immagine)}
      <div class="info">
        <strong class="nome-prodotto" data-id="${esc(p.id)}">${esc(p.nome)}</strong>
        ${p.marca ? `<span class="marca">${esc(p.marca)}</span>` : ''}
        <span class="data">Scade il ${formatData(p.scadenza)}</span>
        <span class="luogo">${esc(luogo(p.posizione))}</span>
      </div>
      <div class="scad">
        <span class="badge">${etichetta(giorni)}</span>
      </div>
    </article>`;
}

function aggiornaBanner() {
  const urgenti = prodotti.filter(p => statoDi(giorniAllaScadenza(p.scadenza)) !== 'verde');
  const banner = $('banner');
  banner.hidden = urgenti.length === 0;
  if (!urgenti.length) return;
  const c = urgenti.some(p => statoDi(giorniAllaScadenza(p.scadenza)) === 'rosso') ? 'rosso' : 'giallo';
  banner.className = c;
  banner.textContent = `⚠️ ${urgenti.length} ${urgenti.length === 1 ? 'prodotto in scadenza' : 'prodotti in scadenza'} (entro ${SOGLIA_GIORNI} giorni o scaduti)`;
}

function render() {
  const lista = prodottiVisibili();
  $('lista').innerHTML = lista.length
    ? lista.map(cardHtml).join('')
    : '<p class="vuoto">Nessun prodotto. Premi + per aggiungerne uno.</p>';
  aggiornaBanner();
}

// --- impostazioni ---
function applicaImpostazioni() {
  document.body.classList.toggle('densita-compatta', impostazioni.densita === 'compatta');
  document.body.classList.toggle('densita-grande', impostazioni.densita === 'grande');
  document.body.classList.toggle('senza-immagini', !impostazioni.immagini);
  document.querySelectorAll('input[name="densita"]').forEach(r => { r.checked = r.value === impostazioni.densita; });
  $('mostraImmagini').checked = impostazioni.immagini;
}

function renderListaLuoghi() {
  $('listaLuoghi').innerHTML = impostazioni.luoghi.map(l => {
    const n = prodotti.filter(p => p.posizione === l.id).length;
    const visibile = !impostazioni.nascosti.includes(l.id);
    return `
      <li class="luogo-riga">
        <label class="riga"><input type="checkbox" data-luogo="${esc(l.id)}" ${visibile ? 'checked' : ''}> ${esc(l.icona)} ${esc(l.nome)}</label>
        <small>${n} ${n === 1 ? 'prodotto' : 'prodotti'}</small>
      </li>`;
  }).join('');
}

$('listaLuoghi').addEventListener('change', e => {
  const cb = e.target.closest('input[data-luogo]');
  if (!cb) return;
  const id = cb.dataset.luogo;
  if (cb.checked) {
    impostazioni.nascosti = impostazioni.nascosti.filter(x => x !== id);
  } else {
    if (luoghiVisibili().length <= 1) {
      cb.checked = true;
      alert('Deve restare almeno un luogo visibile.');
      return;
    }
    impostazioni.nascosti = impostazioni.nascosti.concat(id);
  }
  salvaImpostazioni();
  aggiornaDopoImpostazioni();
});

function apriImpostazioni() {
  applicaImpostazioni();
  renderListaLuoghi();
  $('dialogoImpostazioni').showModal();
}

function aggiornaDopoImpostazioni() {
  renderFiltri();
  renderSelectLuoghi();
  render();
}

document.querySelectorAll('input[name="densita"]').forEach(r => {
  r.addEventListener('change', () => {
    impostazioni.densita = r.value;
    salvaImpostazioni();
    applicaImpostazioni();
  });
});

$('mostraImmagini').addEventListener('change', e => {
  impostazioni.immagini = e.target.checked;
  salvaImpostazioni();
  applicaImpostazioni();
});

$('impostazioniBtn').addEventListener('click', apriImpostazioni);
$('chiudiImpostazioni').addEventListener('click', () => $('dialogoImpostazioni').close());
$('fattoImpostazioni').addEventListener('click', () => $('dialogoImpostazioni').close());

// --- avvisi di sistema ---
async function mostraAvviso(titolo, corpo) {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(titolo, { body: corpo, tag: 'scadenze' });
    } else {
      new Notification(titolo, { body: corpo, tag: 'scadenze' });
    }
  } catch {
    // Il browser non permette l'avviso: resta il banner nell'app.
  }
}

async function avvisaScadenze(forza = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const oggi = dataIso(new Date());
  if (!forza && localStorage.getItem(CHIAVE_AVVISO) === oggi) return;
  const urgenti = prodotti.filter(p => statoDi(giorniAllaScadenza(p.scadenza)) !== 'verde');
  if (!urgenti.length) return;
  const elenco = urgenti.slice(0, 5)
    .map(p => `• ${p.nome}: ${etichetta(giorniAllaScadenza(p.scadenza)).toLowerCase()}`)
    .join('\n');
  const extra = urgenti.length > 5 ? `\n…e altri ${urgenti.length - 5}` : '';
  await mostraAvviso(`${urgenti.length} prodotti in scadenza`, elenco + extra);
  try { localStorage.setItem(CHIAVE_AVVISO, oggi); } catch { /* ignorato */ }
}

function aggiornaPulsanteAvvisi() {
  if (!('Notification' in window)) {
    $('notifBtn').hidden = true;
    return;
  }
  if (Notification.permission === 'granted') {
    $('notifBtn').textContent = '🔔 Avvisi attivi';
    $('notifBtn').disabled = true;
  }
}

// --- lettura del codice a barre dalla foto ---
async function leggiCodiceDaFoto(file) {
  if ('BarcodeDetector' in window) {
    try {
      const immagine = await createImageBitmap(file);
      const rilevatore = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const risultati = await rilevatore.detect(immagine);
      if (risultati.length) return risultati[0].rawValue;
    } catch {
      // provo con la libreria di riserva
    }
  }
  return leggiConZXing(file);
}

async function leggiConZXing(file) {
  if (!window.ZXing) return null;
  const url = URL.createObjectURL(file);
  try {
    const lettore = new ZXing.BrowserMultiFormatReader();
    const risultato = await lettore.decodeFromImageUrl(url);
    return risultato.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- nome, marca e immagine dal database Open Food Facts ---
async function cercaProdotto(codice) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codice)}?fields=product_name,brands,image_front_small_url`);
    const d = await r.json();
    if (d.status !== 1 || !d.product.product_name) return null;
    return {
      nome: d.product.product_name,
      marca: (d.product.brands || '').split(',')[0].trim(),
      immagine: d.product.image_front_small_url || '',
    };
  } catch {
    return null;
  }
}

// --- scelta: prodotti salvati, foto o scrittura a mano ---
function apriScelta() {
  $('cerca').value = '';
  $('statoScelta').textContent = '';
  mostraRisultati();
  $('dialogoScelta').showModal();
}

function mostraRisultati() {
  const q = normalizza($('cerca').value.trim());
  const ul = $('risultati');
  if (!catalogo.length) {
    ul.innerHTML = '<li class="nota">Nessun prodotto salvato ancora: fotografa il codice o scrivi il nome.</li>';
    return;
  }
  const lista = catalogo
    .filter(c => !q || normalizza(c.nome).includes(q) || normalizza(c.marca).includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  if (!lista.length) {
    ul.innerHTML = '<li class="nota">Nessun risultato per questa ricerca.</li>';
    return;
  }
  ul.innerHTML = lista.map(c => `
    <li class="voce-riga">
      <button type="button" class="voce" data-id="${esc(c.id)}">
        ${miniaturaHtml(c.immagine)}
        <span><strong>${esc(c.nome)}</strong><small>${esc(c.marca || '')}${c.marca ? ' · ' : ''}${esc(luogo(c.posizione))}</small></span>
      </button>
      <button type="button" class="rimuovi" data-rimuovi="${esc(c.id)}" aria-label="Togli dai salvati">✕</button>
    </li>`).join('');
}

// --- form con scadenza e luogo ---
function apriForm(dati = {}, messaggio = '') {
  if ($('dialogoScelta').open) $('dialogoScelta').close();
  modificaId = null;
  $('titoloForm').textContent = 'Scadenza prodotto';
  $('indietro').hidden = false;
  $('consumato').hidden = true;
  $('form').reset();
  renderSelectLuoghi();
  $('nome').value = dati.nome || '';
  $('marca').value = dati.marca || '';
  $('codice').value = dati.codice || '';
  $('scadenza').value = dati.scadenza || '';
  $('posizione').value = luoghiVisibili().some(l => l.id === dati.posizione) ? dati.posizione : ultimaPosizione();
  immagineForm = dati.immagine || '';
  $('anteprima').innerHTML = immagineForm ? miniaturaHtml(immagineForm) : '';
  $('anteprima').hidden = !immagineForm;
  $('scanStato').textContent = messaggio;
  $('dialogo').showModal();
  (dati.nome ? $('scadenza') : $('nome')).focus();
}

// Apre il form con i dati del prodotto già inserito, per modificarlo.
function apriModifica(id) {
  const p = prodotti.find(x => x.id === id);
  if (!p) return;
  apriForm({ ...p }, `Modifica i dati di ${p.nome}.`);
  modificaId = id;
  $('titoloForm').textContent = 'Modifica prodotto';
  $('indietro').hidden = true;
  $('consumato').hidden = false;
}

// Salva il prodotto nell'elenco dei prodotti già usati, così la prossima volta non serve la foto.
function ricordaNelCatalogo({ nome, marca, posizione, codice, immagine }) {
  const esistente = catalogo.find(c =>
    (codice && c.codice === codice) || (!codice && normalizza(c.nome) === normalizza(nome))
  );
  if (esistente) {
    Object.assign(esistente, {
      nome, marca, posizione, codice: codice || esistente.codice,
      immagine: immagine || esistente.immagine,
    });
    return;
  }
  catalogo.push({ id: nuovoId(), nome, marca, posizione, codice, immagine });
}

// --- lettura del codice: fotocamera in diretta oppure foto dalla galleria ---
let scannerAttivo = false;
let flussoCamera = null;
let timerScanner = null;
let lettoreZXing = null;

function statoScelta(testo) {
  $('statoScelta').textContent = testo;
}

function statoScanner(testo) {
  $('statoScanner').textContent = testo;
}

async function apriScanner() {
  scannerAttivo = true;
  statoScanner('Avvio la fotocamera…');
  $('dialogoScanner').showModal();
  try {
    flussoCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    statoScanner('Non riesco ad aprire la fotocamera. Controlla il permesso oppure scegli una foto dalla galleria.');
    return;
  }
  const video = $('video');
  video.srcObject = flussoCamera;
  video.play().catch(() => {});
  statoScanner('Avvicina il codice a barre alla fotocamera');

  if ('BarcodeDetector' in window) {
    const rilevatore = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    timerScanner = setInterval(async () => {
      if (!scannerAttivo || video.readyState < 2) return;
      try {
        const risultati = await rilevatore.detect(video);
        if (risultati.length) codiceLetto(risultati[0].rawValue);
      } catch {
        // riprovo al giro successivo
      }
    }, 300);
  } else if (window.ZXing) {
    lettoreZXing = new ZXing.BrowserMultiFormatReader();
    lettoreZXing.decodeFromVideoElement(video, risultato => {
      if (risultato) codiceLetto(risultato.getText());
    });
  } else {
    statoScanner('Questo browser non legge i codici in diretta: scegli una foto dalla galleria.');
  }
}

function fermaScanner() {
  scannerAttivo = false;
  clearInterval(timerScanner);
  timerScanner = null;
  if (lettoreZXing) {
    lettoreZXing.reset();
    lettoreZXing = null;
  }
  if (flussoCamera) {
    flussoCamera.getTracks().forEach(t => t.stop());
    flussoCamera = null;
  }
  $('video').srcObject = null;
}

function codiceLetto(codice) {
  if (!scannerAttivo) return;
  fermaScanner();
  $('dialogoScanner').close();
  gestisciCodice(codice);
}

async function gestisciCodice(codice) {
  const salvato = catalogo.find(c => c.codice === codice);
  if (salvato) {
    apriForm({ ...salvato }, `Già salvato: ${salvato.nome}. Metti la scadenza.`);
    return;
  }
  statoScelta('Codice letto, cerco il prodotto…');
  const trovato = await cercaProdotto(codice);
  if (trovato) {
    apriForm({ ...trovato, codice }, `Trovato: ${trovato.nome}. Metti la scadenza.`);
  } else {
    apriForm({ codice }, 'Codice letto, ma il prodotto non è nel database: scrivi nome e scadenza.');
  }
}

$('scannerBtn').addEventListener('click', apriScanner);
$('chiudiScanner').addEventListener('click', () => $('dialogoScanner').close());
$('dialogoScanner').addEventListener('close', fermaScanner);
$('galleriaBtn').addEventListener('click', () => $('foto').click());

$('foto').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  statoScelta('Leggo il codice…');
  const codice = await leggiCodiceDaFoto(file);
  if (!codice) {
    statoScelta('Non riesco a leggere il codice in questa foto: prova con una foto più vicina e nitida, oppure scrivi il nome.');
    return;
  }
  gestisciCodice(codice);
});

$('cerca').addEventListener('input', mostraRisultati);

$('risultati').addEventListener('click', e => {
  const rimuovi = e.target.closest('.rimuovi');
  if (rimuovi) {
    const c = catalogo.find(x => x.id === rimuovi.dataset.rimuovi);
    if (!c || !confirm(`Togliere "${c.nome}" dai prodotti salvati? Resta nella lista delle scadenze.`)) return;
    catalogo = catalogo.filter(x => x.id !== c.id);
    salvaTutto();
    mostraRisultati();
    return;
  }
  const voce = e.target.closest('.voce');
  if (!voce) return;
  const c = catalogo.find(x => x.id === voce.dataset.id);
  if (c) apriForm({ ...c }, `Metti la scadenza per ${c.nome}.`);
});

$('manualeBtn').addEventListener('click', () => apriForm({}, ''));
$('chiudiScelta').addEventListener('click', () => $('dialogoScelta').close());
$('aggiungi').addEventListener('click', apriScelta);

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const dati = {
    nome: $('nome').value.trim(),
    marca: $('marca').value.trim(),
    posizione: $('posizione').value,
    scadenza: $('scadenza').value,
    codice: $('codice').value.trim(),
    immagine: immagineForm,
  };
  if (modificaId) {
    const daModificare = prodotti.find(x => x.id === modificaId);
    if (daModificare) Object.assign(daModificare, dati);
    modificaId = null;
  } else {
    prodotti.push({ id: nuovoId(), ...dati });
  }
  ricordaNelCatalogo(dati);
  ricordaPosizione(dati.posizione);
  salvaTutto();
  $('dialogo').close();
  render();
});

$('annulla').addEventListener('click', () => $('dialogo').close());
$('indietro').addEventListener('click', () => {
  $('dialogo').close();
  apriScelta();
});

// --- filtri e consumo ---
$('filtri').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  filtro = b.dataset.filtro;
  document.querySelectorAll('#filtri button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
});

$('lista').addEventListener('click', e => {
  const nome = e.target.closest('.nome-prodotto');
  if (nome) apriModifica(nome.dataset.id);
});

// Consumato: elimina il prodotto che si sta modificando.
$('consumato').addEventListener('click', () => {
  const p = prodotti.find(x => x.id === modificaId);
  if (!p || !confirm(`Segnare "${p.nome}" come consumato e toglierlo dalla lista?`)) return;
  prodotti = prodotti.filter(x => x.id !== p.id);
  modificaId = null;
  salvaTutto();
  $('dialogo').close();
  render();
});

$('dialogo').addEventListener('close', () => {
  modificaId = null;
});

// --- backup (prodotti, prodotti salvati e impostazioni) ---
$('esporta').addEventListener('click', () => {
  const dati = { versione: 3, prodotti, catalogo, impostazioni };
  const blob = new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scadenze-${dataIso(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$('importa').addEventListener('click', () => $('fileImporta').click());

$('fileImporta').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dati = JSON.parse(await file.text());
    if (!dati || typeof dati !== 'object') throw new Error('formato non valido');
    const daProdotti = Array.isArray(dati) ? dati : (dati.prodotti || []);
    const daCatalogo = Array.isArray(dati) ? [] : (dati.catalogo || []);
    const idProdotti = new Set(prodotti.map(p => p.id));
    const idCatalogo = new Set(catalogo.map(c => c.id));
    const pNuovi = daProdotti.filter(p => p && p.id && p.nome && p.scadenza && !idProdotti.has(p.id));
    const cNuovi = daCatalogo.filter(c => c && c.id && c.nome && !idCatalogo.has(c.id));
    const luoghiNuovi = (dati.impostazioni && Array.isArray(dati.impostazioni.luoghi) ? dati.impostazioni.luoghi : [])
      .filter(l => l && l.id && l.nome && !impostazioni.luoghi.some(x => x.id === l.id));
    prodotti = prodotti.concat(pNuovi);
    catalogo = catalogo.concat(cNuovi);
    impostazioni.luoghi = impostazioni.luoghi.concat(luoghiNuovi);
    salvaTutto();
    salvaImpostazioni();
    aggiornaDopoImpostazioni();
    alert(`Importati ${pNuovi.length} prodotti, ${cNuovi.length} prodotti salvati e ${luoghiNuovi.length} luoghi.`);
  } catch {
    alert('File di backup non valido.');
  }
});

// --- avvisi all'apertura e al ritorno nell'app ---
$('notifBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    alert('Questo browser non supporta gli avvisi.');
    return;
  }
  const esito = await Notification.requestPermission();
  aggiornaPulsanteAvvisi();
  if (esito === 'granted') {
    avvisaScadenze(true);
  } else {
    alert('Gli avvisi non sono attivi. Puoi riattivarli dalle impostazioni del sito nel browser.');
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    render();
    avvisaScadenze();
  }
});

sistemaLuoghiProdotti();
salvaTutto();
applicaImpostazioni();
renderFiltri();
renderSelectLuoghi();
render();
aggiornaPulsanteAvvisi();
avvisaScadenze();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
