  'use strict';
/* =========================================================
   RAM Sawit - script.js
   Bagian: 1 Helper | 2 Data | 3 Login | 4 Navigasi
           5 Halaman | 6 Cetak & Notifikasi | 7 Mulai
   ========================================================= */

/* ---------- 1. HELPER ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const rp = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const kg = n => (Math.round((n || 0) * 10) / 10).toLocaleString('id-ID') + ' kg';
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const dstr = d => iso(d).slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtD = s => new Date(s.length === 10 ? s + 'T00:00' : s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = s => `<span class="badge ${s === 'Lunas' ? 'ok' : 'wait'}">${s}</span>`;
const stat = ([ic, l, v]) => `<div class="stat"><span class="ic">${ic}</span><div><small>${l}</small><b>${v}</b></div></div>`;
const tbl = (h, rows) => `<thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${
  rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  : `<tr><td colspan="${h.length}" class="empty">Belum ada data</td></tr>`}</tbody>`;
const bars = (el, items, fmt = v => (v / 1000).toFixed(1) + ' t') => {
  const m = Math.max(1, ...items.map(i => i.v));
  el.innerHTML = items.map(i => `<div class="bar"><span class="val">${fmt(i.v)}</span><div class="fill" style="height:${i.v / m * 80}%"></div><span class="lbl">${i.l}</span></div>`).join('');
};
const inRange = (x, a, b) => { const d = x.dt.slice(0, 10); return d >= a && d <= b; };

/* Ilustrasi kebun sawit (SVG buatan sendiri) */
function palm(x, h) {
  const top = 190 - h;
  const leaves = [-60, -20, 20, 60, 160, 200].map(a => `<ellipse cx="${x + 22}" cy="${top}" rx="24" ry="5" transform="rotate(${a} ${x} ${top})"/>`).join('');
  return `<path d="M${x} 190Q${x + 8} ${190 - h / 2} ${x} ${top}" stroke="#7a5230" stroke-width="6" fill="none"/><g fill="#1f6b3a">${leaves}</g><circle cx="${x}" cy="${top + 4}" r="5" fill="#b8742e"/>`;
}
const PALM = `<svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><rect width="400" height="200" fill="#d6efd8"/><circle cx="340" cy="42" r="22" fill="#ffd966"/><path d="M0 165Q100 135 200 160T400 148V200H0Z" fill="#8cc28c"/><path d="M0 185Q120 160 240 180T400 172V200H0Z" fill="#2e7d4f"/>${palm(50, 100)}${palm(130, 130)}${palm(210, 90)}${palm(290, 120)}</svg>`;

/* ---------- 2. DATA (diambil dari server PHP/MySQL) ---------- */
let db = { farmers: [], prices: [], tx: [], nextNo: '' }, user = null, lastTx = null;

/* Kirim permintaan ke api/index.php. Mengembalikan JSON, atau null jika gagal (pesan error tampil sebagai notifikasi). */
async function api(action, body) {
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  try {
    const r = await fetch('api/index.php?action=' + action, opt), j = await r.json();
    if (!r.ok || j.error) { toast(j.error || 'Terjadi kesalahan.', true); return null; }
    return j;
  } catch (e) {
    toast('Server tidak terjangkau. Jalankan Apache & MySQL di XAMPP, lalu buka http://localhost/ram-sawit/', true);
    return null;
  }
}
async function reload() { const j = await api('data'); if (j) db = j; return !!j; }

/* Rumus (hanya untuk pratinjau di form; server menghitung ulang): bersih = kotor - kosong ; total = bersih x harga - potongan */
const hitung = (gross, tare, price, cut) => { const net = Math.max(0, gross - tare); return { net, total: net * price - cut }; };

function curPrice() {
  const t = dstr(new Date()), s = [...db.prices].sort((a, b) => a.date.localeCompare(b.date));
  let i = s.map(p => p.date <= t).lastIndexOf(true); if (i < 0) i = s.length - 1;
  return { cur: s[i], prev: s[i - 1] };
}

/* ---------- 3. LOGIN ---------- */
let role = 'admin';
const hints = { admin: 'Demo: admin / admin123', petani: 'Demo: p001 / petani123 (username = ID petani)' };
function setRole(r) {
  role = r; $$('#roleTabs button').forEach(b => b.classList.toggle('on', b.dataset.role === r));
  $('#lHint').textContent = hints[r]; $('#lErr').textContent = '';
}
$('#roleTabs').onclick = e => { if (e.target.dataset.role) setRole(e.target.dataset.role); };
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const u = $('#lUser').value.trim(), p = $('#lPass').value, err = $('#lErr');
  if (!u || !p) { err.textContent = 'Username dan password wajib diisi.'; return; }
  const j = await api('login', { username: u, password: p, role });
  if (!j) { err.textContent = 'Login gagal.'; return; }
  err.textContent = ''; user = j.user; start();
};
$('#logout').onclick = async () => {
  await api('logout', {});
  user = null; $('#app').hidden = true; $('#login').hidden = false; $('#lPass').value = '';
};

/* ---------- 4. NAVIGASI (hak akses per peran) ---------- */
const PAGES = [['dashboard', '📊', 'Dashboard', 'admin'], ['transaksi', '⚖️', 'Transaksi Penjualan', 'admin'],
  ['petani', '👨‍🌾', 'Data Petani', 'admin'], ['harga', '💰', 'Harga Sawit', 'admin'],
  ['riwayat', '🧾', 'Riwayat Transaksi', 'admin'], ['laporan', '📈', 'Laporan', 'admin'], ['portal', '🏠', 'Tampilan Petani', 'petani']];
let curPage = '';
const R = {}; // R.namaHalaman = fungsi yang menggambar halaman

function go(id) {
  const p = PAGES.find(x => x[0] === id);
  if (!p || p[3] !== user.role) return;
  $$('.page').forEach(s => s.classList.toggle('on', s.id === 'page-' + id));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.p === id));
  $('#title').textContent = p[2];
  curPage = id; R[id](); closeMenu(); window.scrollTo(0, 0);
}
const closeMenu = () => { $('#sidebar').classList.remove('open'); $('#overlay').classList.remove('show'); };
$('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#overlay').classList.add('show'); };
$('#overlay').onclick = closeMenu;
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.p); };

async function start() {
  if (!(await reload())) return;
  $('#login').hidden = true; $('#app').hidden = false;
  const mine = PAGES.filter(p => p[3] === user.role);
  $('#nav').innerHTML = mine.map(p => `<button data-p="${p[0]}">${p[1]} ${p[2]}</button>`).join('');
  $('#who').textContent = (user.role === 'admin' ? 'Admin: ' : 'Petani: ') + user.name;
  go(mine[0][0]);
}

/* ---------- 5. HALAMAN ---------- */

/* 5a. Dashboard */
let dMode = 'd';
function dailySeries(n) {
  return [...Array(n)].map((_, i) => { const d = addDays(new Date(), i - n + 1), s = dstr(d);
    return { l: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }), v: sum(db.tx.filter(x => x.dt.startsWith(s)), x => x.net) }; });
}
function weeklySeries(n) {
  return [...Array(n)].map((_, i) => { const end = addDays(new Date(), -7 * (n - 1 - i)), a = dstr(addDays(end, -6)), b = dstr(end);
    return { l: 'M-' + (i + 1), v: sum(db.tx.filter(x => inRange(x, a, b)), x => x.net) }; });
}
R.dashboard = () => {
  const t = dstr(new Date()), a = db.tx.filter(x => x.dt.startsWith(t)), pr = curPrice().cur.price;
  $('#dHarga').textContent = rp(pr);
  $('#dStats').innerHTML = [['🛒', 'Total pembelian', rp(sum(a, x => x.net * x.price))], ['⚖️', 'Total berat', kg(sum(a, x => x.net))],
    ['💵', 'Total pembayaran', rp(sum(a, x => x.total))], ['👨‍🌾', 'Petani menjual', new Set(a.map(x => x.fid)).size],
    ['🏷️', 'Harga sawit/kg', rp(pr)]].map(stat).join('');
  bars($('#dChart'), dMode === 'd' ? dailySeries(7) : weeklySeries(6));
  const rec = [...db.tx].sort((x, y) => y.dt.localeCompare(x.dt)).slice(0, 6);
  $('#dRecent').innerHTML = tbl(['No. transaksi', 'Petani', 'Berat bersih', 'Total', 'Status'],
    rec.map(x => [x.id, esc(x.fname), kg(x.net), rp(x.total), badge(x.status)]));
};
$('#dTabs').onclick = e => {
  if (!e.target.dataset.m) return;
  dMode = e.target.dataset.m; $$('#dTabs button').forEach(b => b.classList.toggle('on', b === e.target)); R.dashboard();
};

/* 5b. Transaksi penjualan */
const nextNo = () => db.nextNo;
function calcForm() {
  const g = +$('#fGross').value || 0, t = +$('#fTare').value || 0, c = +$('#fCut').value || 0, p = curPrice().cur.price;
  const h = hitung(g, t, p, c);
  $('#fNet').value = h.net; $('#fHarga').value = rp(p); $('#fTotal').textContent = rp(h.total);
  return { g, t, c, p, ...h };
}
function fillHp() { const f = db.farmers.find(x => x.id === $('#fPetani').value); $('#fHp').value = f ? f.hp : ''; }
R.transaksi = () => {
  $('#fPetani').innerHTML = db.farmers.length ? db.farmers.map(f => `<option value="${f.id}">${esc(f.name)} (${f.id})</option>`).join('') : '<option value="">Belum ada petani</option>';
  $('#fNo').value = nextNo(); $('#fDt').value = iso(new Date());
  $('#fErr').textContent = ''; $('#btnStruk').disabled = !lastTx; fillHp(); calcForm();
};
['fGross', 'fTare', 'fCut'].forEach(id => $('#' + id).addEventListener('input', calcForm));
$('#fPetani').onchange = fillHp;
$('#txForm').onsubmit = async e => {
  e.preventDefault();
  const v = calcForm(), f = db.farmers.find(x => x.id === $('#fPetani').value), kend = $('#fKend').value.trim();
  let m = '';
  if (!f) m = 'Pilih petani terlebih dahulu (tambahkan di Data Petani).';
  else if (!kend) m = 'Nomor kendaraan wajib diisi.';
  else if (v.g <= 0) m = 'Berat kotor harus lebih dari 0.';
  else if (v.t < 0 || v.t >= v.g) m = 'Berat kosong harus lebih kecil dari berat kotor.';
  else if (v.c < 0 || v.total < 0) m = 'Potongan tidak boleh melebihi nilai sawit.';
  $('#fErr').textContent = m;
  if (m) { toast(m, true); return; }
  const j = await api('tx_add', { fid: f.id, kend, gross: v.g, tare: v.t, cut: v.c, method: $('#fMetode').value });
  if (!j) return;
  lastTx = j.tx; await reload();
  toast('Transaksi ' + lastTx.id + ' berhasil disimpan');
  $('#fKend').value = ''; $('#fGross').value = ''; $('#fTare').value = ''; $('#fCut').value = 0; R.transaksi();
};
$('#btnStruk').onclick = () => lastTx && printHtml(receipt(lastTx));

/* 5c. Data petani */
R.petani = () => {
  const q = $('#pSearch').value.toLowerCase();
  const rows = db.farmers.filter(f => (f.id + f.name + f.hp + f.addr).toLowerCase().includes(q)).map(f => {
    const a = db.tx.filter(x => x.fid === f.id);
    return [f.id, esc(f.name), esc(f.hp), esc(f.addr), a.length, kg(sum(a, x => x.net)), rp(sum(a, x => x.total)),
      `<button class="btn sm" data-edit="${f.id}">Edit</button> <button class="btn sm danger" data-del="${f.id}">Hapus</button>`];
  });
  $('#pTable').innerHTML = tbl(['ID', 'Nama', 'No. HP', 'Alamat', 'Transaksi', 'Total berat', 'Total pembayaran', 'Aksi'], rows);
};
$('#pSearch').oninput = R.petani;
function openModal(f) {
  $('#mTitle').textContent = f ? 'Edit petani' : 'Tambah petani';
  $('#mId').value = f ? f.id : ''; $('#mName').value = f ? f.name : ''; $('#mHp').value = f ? f.hp : ''; $('#mAddr').value = f ? f.addr : '';
  $('#mErr').textContent = ''; $('#modal').hidden = false; $('#mName').focus();
}
$('#pAdd').onclick = () => openModal(null);
$('#mCancel').onclick = () => { $('#modal').hidden = true; };
$('#pTable').onclick = async e => {
  const ed = e.target.dataset.edit, del = e.target.dataset.del;
  if (ed) openModal(db.farmers.find(f => f.id === ed));
  if (del && confirm('Hapus petani ' + del + '? Riwayat transaksinya tetap tersimpan.')) {
    if (await api('farmer_delete', { id: del })) { await reload(); R.petani(); toast('Petani dihapus'); }
  }
};
$('#mForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('#mName').value.trim(), hp = $('#mHp').value.trim(), addr = $('#mAddr').value.trim(), id = $('#mId').value;
  let m = '';
  if (name.length < 3) m = 'Nama petani minimal 3 huruf.';
  else if (!/^08\d{8,11}$/.test(hp)) m = 'No. HP harus diawali 08 dan berisi 10-13 angka.';
  else if (!addr) m = 'Alamat wajib diisi.';
  $('#mErr').textContent = m; if (m) return;
  if (!(await api('farmer_save', { id, name, hp, addr }))) return;
  await reload(); $('#modal').hidden = true; R.petani(); toast('Data petani disimpan');
};

/* 5d. Harga sawit */
R.harga = () => {
  const { cur, prev } = curPrice();
  $('#hNow').textContent = rp(cur.price); $('#hDate').textContent = fmtD(cur.date); $('#hPrev').textContent = prev ? rp(prev.price) : '-';
  $('#hTgl').value = dstr(new Date()); $('#hErr').textContent = '';
  const s = [...db.prices].sort((a, b) => b.date.localeCompare(a.date));
  $('#hTable').innerHTML = tbl(['Tanggal berlaku', 'Harga/kg', 'Perubahan'], s.map((p, i) => {
    const o = s[i + 1], d = o ? p.price - o.price : 0;
    return [fmtD(p.date), rp(p.price), o ? (d >= 0 ? '▲ ' : '▼ ') + rp(Math.abs(d)) : '-'];
  }));
};
$('#hForm').onsubmit = async e => {
  e.preventDefault();
  const price = +$('#hPrice').value, date = $('#hTgl').value;
  const m = !(price > 0) ? 'Harga harus lebih dari 0.' : !date ? 'Tanggal berlaku wajib diisi.' : '';
  $('#hErr').textContent = m; if (m) return;
  if (!(await api('price_add', { price, date }))) return;
  await reload(); $('#hPrice').value = ''; R.harga();
  toast('Harga diperbarui dan dipakai di transaksi baru');
};

/* 5e. Riwayat transaksi */
function filtered() {
  const q = $('#rQ').value.toLowerCase(), a = $('#rFrom').value, b = $('#rTo').value, p = $('#rPetani').value;
  return db.tx.filter(x => (!q || (x.id + x.fname + x.kend).toLowerCase().includes(q)) && (!a || x.dt.slice(0, 10) >= a)
    && (!b || x.dt.slice(0, 10) <= b) && (!p || x.fid === p)).sort((x, y) => y.dt.localeCompare(x.dt));
}
R.riwayat = () => {
  const sel = $('#rPetani'), keep = sel.value;
  sel.innerHTML = '<option value="">Semua petani</option>' + db.farmers.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  sel.value = keep;
  $('#rTable').innerHTML = tbl(['No. transaksi', 'Tanggal', 'Petani', 'Berat bersih', 'Harga/kg', 'Potongan', 'Total', 'Status', 'Aksi'],
    filtered().map(x => [x.id, fmtD(x.dt), esc(x.fname), kg(x.net), rp(x.price), rp(x.cut), rp(x.total), badge(x.status),
      `<button class="btn sm ghost" data-struk="${x.id}">Struk</button>` + (x.status !== 'Lunas' ? ` <button class="btn sm" data-lunas="${x.id}">Tandai lunas</button>` : '')]));
};
['rQ', 'rFrom', 'rTo', 'rPetani'].forEach(id => $('#' + id).addEventListener('input', R.riwayat));
$('#rReset').onclick = () => { ['rQ', 'rFrom', 'rTo', 'rPetani'].forEach(id => { $('#' + id).value = ''; }); R.riwayat(); };
$('#rTable').onclick = async e => {
  const s = e.target.dataset.struk, l = e.target.dataset.lunas;
  if (s) printHtml(receipt(db.tx.find(x => x.id === s)));
  if (l && await api('tx_paid', { id: l })) { await reload(); R.riwayat(); toast('Status pembayaran diperbarui'); }
};
$('#rPrint').onclick = () => {
  const c = $('#rTable').cloneNode(true); $$('tr', c).forEach(r => r.lastElementChild.remove());
  printHtml(`<h2>Laporan Riwayat Transaksi - RAM Sawit</h2><p>Dicetak: ${new Date().toLocaleString('id-ID')}</p><table>${c.innerHTML}</table>`);
};

/* 5f. Laporan */
function reportRange() {
  const v = $('#lDate').value || dstr(new Date()), d = new Date(v + 'T00:00'), t = $('#lType').value;
  if (t === 'd') return [v, v];
  if (t === 'w') return [dstr(addDays(d, -6)), v];
  return [v.slice(0, 8) + '01', dstr(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}
R.laporan = () => {
  if (!$('#lDate').value) $('#lDate').value = dstr(new Date());
  const [a, b] = reportRange(), list = db.tx.filter(x => inRange(x, a, b)), days = [];
  for (let d = new Date(a + 'T00:00'); dstr(d) <= b; d = addDays(d, 1)) days.push(dstr(d));
  const per = days.map(s => ({ s, a: list.filter(x => x.dt.startsWith(s)) }));
  $('#lStats').innerHTML = [['🧾', 'Jumlah transaksi', list.length], ['⚖️', 'Total berat sawit', kg(sum(list, x => x.net))],
    ['🛒', 'Total pembelian', rp(sum(list, x => x.net * x.price))], ['💵', 'Total pembayaran', rp(sum(list, x => x.total))]].map(stat).join('');
  bars($('#lChart'), per.map(p => ({ l: p.s.slice(8), v: sum(p.a, x => x.net) })));
  $('#lTable').innerHTML = tbl(['Tanggal', 'Transaksi', 'Berat bersih', 'Pembelian', 'Potongan', 'Pembayaran'],
    per.map(p => [fmtD(p.s), p.a.length, kg(sum(p.a, x => x.net)), rp(sum(p.a, x => x.net * x.price)), rp(sum(p.a, x => x.cut)), rp(sum(p.a, x => x.total))]));
};
['lType', 'lDate'].forEach(id => $('#' + id).addEventListener('input', R.laporan));
$('#lPrint').onclick = () => printHtml(`<h2>Laporan RAM Sawit (${$('#lType').selectedOptions[0].text})</h2><div>${$('#lStats').innerText.replace(/\n+/g, ' | ')}</div><table>${$('#lTable').innerHTML}</table>`);

/* 5g. Tampilan petani */
R.portal = () => {
  const a = db.tx.filter(x => x.fid === user.fid).sort((x, y) => y.dt.localeCompare(x.dt));
  $('#ptName').textContent = 'Halo, ' + user.name; $('#ptHarga').textContent = rp(curPrice().cur.price);
  $('#ptStats').innerHTML = [['⚖️', 'Total berat dijual', kg(sum(a, x => x.net))], ['💵', 'Uang diterima (lunas)', rp(sum(a.filter(x => x.status === 'Lunas'), x => x.total))],
    ['⏳', 'Menunggu pembayaran', rp(sum(a.filter(x => x.status !== 'Lunas'), x => x.total))]].map(stat).join('');
  $('#ptTable').innerHTML = tbl(['No. transaksi', 'Tanggal', 'Berat bersih', 'Harga/kg', 'Total', 'Status'],
    a.map(x => [x.id, fmtD(x.dt), kg(x.net), rp(x.price), rp(x.total), badge(x.status)]));
};

/* ---------- 6. CETAK & NOTIFIKASI ---------- */
const line = (a, b) => `<div class="r"><span>${a}</span><span>${b}</span></div>`;
function receipt(t) {
  return `<div class="struk"><h3 class="c">🌴 RAM Sawit</h3><p class="c">Struk Pembelian Sawit</p><hr>
    <p>No : ${t.id}</p><p>Tgl: ${new Date(t.dt).toLocaleString('id-ID')}</p><p>Petani: ${esc(t.fname)}</p><p>Kendaraan: ${esc(t.kend)}</p><hr>
    ${line('Berat kotor', kg(t.gross))}${line('Berat kosong', kg(t.tare))}${line('Berat bersih', kg(t.net))}${line('Harga/kg', rp(t.price))}${line('Potongan', rp(t.cut))}<hr>
    ${line('<b>TOTAL</b>', '<b>' + rp(t.total) + '</b>')}${line('Metode', t.method)}${line('Status', t.status)}<hr><p class="c">Terima kasih</p></div>`;
}
function printHtml(html) { $('#printArea').innerHTML = html; window.print(); }
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = ''; }, 3000);
}

/* ---------- 7. MULAI ---------- */
$$('.hero-art').forEach(el => { el.innerHTML = '<img src="api/imgkebun.jpg.jpeg" alt="Kebun kelapa sawit">'; });

setRole('admin');
api('me').then(j => { if (j && j.user) { user = j.user; start(); } });

/* Pembaruan otomatis tiap 30 detik (hanya halaman baca-saja, agar isian form tidak terhapus) */
setInterval(async () => {
  if (!user || document.hidden || !['dashboard', 'riwayat', 'laporan', 'portal'].includes(curPage)) return;
  if (await reload()) R[curPage]();
}, 30000);
