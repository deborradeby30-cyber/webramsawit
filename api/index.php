<?php
// API RAM Sawit. Dipanggil dari script.js: api/index.php?action=NAMA
// Semua validasi dan perhitungan diulang di sini, jadi tidak bisa dimanipulasi dari browser.
require __DIR__ . '/config.php';
session_start();
header('Content-Type: application/json; charset=utf-8');

function out($data, int $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $msg, int $code = 400) { out(['error' => $msg], $code); }

// Wajib login; jika $role diisi, peran harus sama.
function need(?string $role = null): array {
    if (empty($_SESSION['user'])) fail('Silakan login terlebih dahulu.', 401);
    if ($role && $_SESSION['user']['role'] !== $role) fail('Anda tidak punya akses.', 403);
    return $_SESSION['user'];
}
function q(string $sql, array $p = []): array { $s = db()->prepare($sql); $s->execute($p); return $s->fetchAll(); }
function one(string $sql, array $p = []) { $r = q($sql, $p); return $r[0] ?? null; }

function currentPrice(): int {
    $r = one('SELECT price FROM prices WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1', [date('Y-m-d')])
        ?? one('SELECT price FROM prices ORDER BY effective_date DESC, id DESC LIMIT 1');
    if (!$r) fail('Harga sawit belum diatur.');
    return (int)$r['price'];
}
function nextNo(): string {
    $pre = 'TRX-' . date('Ymd') . '-';
    $r = one('SELECT MAX(CAST(SUBSTRING(id, -3) AS UNSIGNED)) AS n FROM transactions WHERE id LIKE ?', [$pre . '%']);
    return $pre . str_pad(((int)$r['n']) + 1, 3, '0', STR_PAD_LEFT);
}
function txRow(array $t): array {
    foreach (['gross', 'tare', 'net'] as $k) $t[$k] = (float)$t[$k];
    foreach (['price', 'cut', 'total'] as $k) $t[$k] = (int)$t[$k];
    return $t;
}
const TX_SELECT = "SELECT id, DATE_FORMAT(dt,'%Y-%m-%dT%H:%i') AS dt, farmer_id AS fid, farmer_name AS fname, vehicle AS kend,
    gross, tare, net, price, `cut`, total, method, status FROM transactions";

$action = $_GET['action'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?: [];

try {
    switch ($action) {
        case 'login':
            $u = one('SELECT * FROM users WHERE username = ?', [strtolower(trim($in['username'] ?? ''))]);
            if (!$u || !password_verify($in['password'] ?? '', $u['password_hash']) || $u['role'] !== ($in['role'] ?? ''))
                fail('Username, password, atau peran salah.', 401);
            session_regenerate_id(true);
            $name = 'Admin RAM';
            if ($u['role'] === 'petani') $name = one('SELECT name FROM farmers WHERE id = ?', [$u['farmer_id']])['name'] ?? $u['username'];
            $_SESSION['user'] = ['role' => $u['role'], 'name' => $name, 'fid' => $u['farmer_id']];
            out(['user' => $_SESSION['user']]);

        case 'me':
            out(['user' => $_SESSION['user'] ?? null]);

        case 'logout':
            session_destroy();
            out(['ok' => true]);

        case 'data': // admin: semua data, petani: hanya miliknya
            $u = need();
            $admin = $u['role'] === 'admin';
            $farmers = $admin ? q('SELECT * FROM farmers ORDER BY id') : q('SELECT * FROM farmers WHERE id = ?', [$u['fid']]);
            $tx = $admin ? q(TX_SELECT . ' ORDER BY dt') : q(TX_SELECT . ' WHERE farmer_id = ? ORDER BY dt', [$u['fid']]);
            $prices = q("SELECT price, DATE_FORMAT(effective_date,'%Y-%m-%d') AS date FROM prices ORDER BY effective_date, id");
            foreach ($prices as &$p) $p['price'] = (int)$p['price'];
            out(['farmers' => $farmers, 'prices' => $prices, 'tx' => array_map('txRow', $tx), 'nextNo' => nextNo()]);

        case 'tx_add':
            need('admin');
            $f = one('SELECT * FROM farmers WHERE id = ?', [$in['fid'] ?? '']);
            $kend = trim($in['kend'] ?? ''); $g = (float)($in['gross'] ?? 0); $t = (float)($in['tare'] ?? 0);
            $cut = (int)($in['cut'] ?? 0); $m = $in['method'] ?? '';
            if (!$f) fail('Petani tidak ditemukan.');
            if ($kend === '' || strlen($kend) > 20) fail('Nomor kendaraan wajib diisi (maks 20 karakter).');
            if ($g <= 0) fail('Berat kotor harus lebih dari 0.');
            if ($t < 0 || $t >= $g) fail('Berat kosong harus lebih kecil dari berat kotor.');
            if (!in_array($m, ['Tunai', 'Transfer'], true)) fail('Metode pembayaran tidak valid.');
            $price = currentPrice(); $net = $g - $t;                  // Berat bersih = kotor - kosong
            $total = (int)round($net * $price) - $cut;                // Total = bersih x harga - potongan
            if ($cut < 0 || $total < 0) fail('Potongan tidak boleh melebihi nilai sawit.');
            $id = nextNo(); $now = date('Y-m-d H:i:s'); $status = $m === 'Tunai' ? 'Lunas' : 'Menunggu';
            db()->prepare('INSERT INTO transactions (id, dt, farmer_id, farmer_name, vehicle, gross, tare, net, price, cut, total, method, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id, $now, $f['id'], $f['name'], $kend, $g, $t, $net, $price, $cut, $total, $m, $status]);
            out(['ok' => true, 'tx' => txRow(one(TX_SELECT . ' WHERE id = ?', [$id]))]);

        case 'tx_paid':
            need('admin');
            db()->prepare("UPDATE transactions SET status = 'Lunas' WHERE id = ?")->execute([$in['id'] ?? '']);
            out(['ok' => true]);

        case 'farmer_save':
            need('admin');
            $name = trim($in['name'] ?? ''); $hp = trim($in['hp'] ?? ''); $addr = trim($in['addr'] ?? ''); $id = $in['id'] ?? '';
            if (mb_strlen($name) < 3) fail('Nama petani minimal 3 huruf.');
            if (!preg_match('/^08\d{8,11}$/', $hp)) fail('No. HP harus diawali 08 dan berisi 10-13 angka.');
            if ($addr === '') fail('Alamat wajib diisi.');
            if ($id !== '') {
                db()->prepare('UPDATE farmers SET name=?, hp=?, addr=? WHERE id=?')->execute([$name, $hp, $addr, $id]);
            } else {
                $n = (int)one("SELECT MAX(CAST(SUBSTRING(id,2) AS UNSIGNED)) AS n FROM farmers")['n'] + 1;
                $id = 'P' . str_pad($n, 3, '0', STR_PAD_LEFT);
                db()->prepare('INSERT INTO farmers (id, name, hp, addr) VALUES (?,?,?,?)')->execute([$id, $name, $hp, $addr]);
                db()->prepare("INSERT INTO users (username, password_hash, role, farmer_id) VALUES (?,?, 'petani', ?)")
                    ->execute([strtolower($id), password_hash('petani123', PASSWORD_DEFAULT), $id]);
            }
            out(['ok' => true, 'id' => $id]);

        case 'farmer_delete': // riwayat transaksi tetap tersimpan
            need('admin');
            db()->prepare('DELETE FROM users WHERE farmer_id = ?')->execute([$in['id'] ?? '']);
            db()->prepare('DELETE FROM farmers WHERE id = ?')->execute([$in['id'] ?? '']);
            out(['ok' => true]);

        case 'price_add':
            need('admin');
            $price = (int)($in['price'] ?? 0); $date = $in['date'] ?? '';
            if ($price <= 0) fail('Harga harus lebih dari 0.');
            if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) fail('Tanggal berlaku tidak valid.');
            db()->prepare('INSERT INTO prices (price, effective_date) VALUES (?,?)')->execute([$price, $date]);
            out(['ok' => true]);

        default:
            fail('Aksi tidak dikenal.', 404);
    }
} catch (PDOException $e) {
    fail('Kesalahan database. Sudah menjalankan api/setup.php? (' . $e->getMessage() . ')', 500);
}
