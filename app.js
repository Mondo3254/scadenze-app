const CHIAVE = 'scadenze.prodotti.v1';
const CHIAVE_AVVISO = 'scadenze.ultimoAvviso';
const SOGLIA_GIORNI = 3;

let prodotti = caricaProdotti();
let filtro = 'tutti';

const $ = id => document.getElementById(id);

// --- memoria del browser (localStorage) ---
function caricaProdotti() {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE)) || [];
  } catch {
    return [];
  }
}

function salvaProdotti() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(prodotti));
  } catch {
    alert('Non riesco a salvare i dati su questo dispositivo.');
  }
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

function esc(testo) {
  return String(testo ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
    <article class="card ${statoDi(giorni)}">
      <div class="info">
        <strong>${esc(p.nome)}</strong>
        ${p.marca ? `<span class="marca">${esc(p.marca)}</span>` : ''}
        <span class="luogo">${p.posizione === 'frigo' ? '❄️ Frigo' : '🗄️ Armadio'}</span>
      </div>
      <div class="scad">
        <span class="badge">${etichetta(giorni)}</span>
        <small>${formatData(p.scadenza)}</small>
        <button type="button" class="elimina" data-id="${esc(p.id)}">Consumato</button>
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

// --- nome e marca dal database Open Food Facts ---
async function cercaProdotto(codice) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codice)}?fields=product_name,brands`);
    const d = await r.json();
    if (d.status !== 1 || !d.product.product_name) return null;
    return {
      nome: d.product.product_name,
      marca: (d.product.brands || '').split(',')[0].trim(),
    };
  } catch {
    return null;
  }
}

// --- form ---
function apriForm() {
  $('form').reset();
  $('scanStato').textContent = '';
  $('dialogo').showModal();
  $('nome').focus();
}

$('fotoBtn').addEventListener('click', () => $('foto').click());

$('foto').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  $('scanStato').textContent = 'Leggo il codice…';
  const codice = await leggiCodiceDaFoto(file);
  if (!codice) {
    $('scanStato').textContent = 'Non riesco a leggere il codice: riprova più vicino e con più luce, oppure scrivilo a mano.';
    return;
  }
  $('codice').value = codice;
  $('scanStato').textContent = 'Codice letto, cerco il prodotto…';
  const trovato = await cercaProdotto(codice);
  if (trovato) {
    if (!$('nome').value) $('nome').value = trovato.nome;
    if (!$('marca').value) $('marca').value = trovato.marca;
    $('scanStato').textContent = `Trovato: ${trovato.nome}. Metti la scadenza.`;
  } else {
    $('scanStato').textContent = 'Codice letto, ma prodotto non trovato: scrivi nome e scadenza.';
  }
});

document.querySelectorAll('#scorciatoie button').forEach(b => {
  b.addEventListener('click', () => {
    const d = new Date();
    d.setDate(d.getDate() + Number(b.dataset.giorni));
    $('scadenza').value = dataIso(d);
  });
});

$('form').addEventListener('submit', e => {
  e.preventDefault();
  prodotti.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: $('nome').value.trim(),
    marca: $('marca').value.trim(),
    posizione: $('posizione').value,
    scadenza: $('scadenza').value,
    codice: $('codice').value.trim(),
  });
  salvaProdotti();
  $('dialogo').close();
  render();
});

$('annulla').addEventListener('click', () => $('dialogo').close());
$('aggiungi').addEventListener('click', apriForm);

// --- filtri e consumo ---
document.querySelector('.filtri').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  filtro = b.dataset.filtro;
  document.querySelectorAll('.filtri button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
});

$('lista').addEventListener('click', e => {
  const b = e.target.closest('.elimina');
  if (!b) return;
  const p = prodotti.find(x => x.id === b.dataset.id);
  if (!p || !confirm(`Segnare "${p.nome}" come consumato e toglierlo dalla lista?`)) return;
  prodotti = prodotti.filter(x => x.id !== p.id);
  salvaProdotti();
  render();
});

// --- backup ---
$('esporta').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(prodotti, null, 2)], { type: 'application/json' });
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
    if (!Array.isArray(dati)) throw new Error('formato non valido');
    const idEsistenti = new Set(prodotti.map(p => p.id));
    const nuovi = dati.filter(p => p && p.id && p.nome && p.scadenza && !idEsistenti.has(p.id));
    prodotti = prodotti.concat(nuovi);
    salvaProdotti();
    render();
    alert(`Importati ${nuovi.length} prodotti.`);
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

render();
aggiornaPulsanteAvvisi();
avvisaScadenze();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
