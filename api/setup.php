<?php
// Jalankan SEKALI lewat browser: http://localhost/ram-sawit/api/setup.php
// Membuat database, tabel, akun, dan data contoh. Aman dijalankan ulang (tidak menimpa data).
require __DIR__ . '/config.php';
header('Content-Type: text/plain; charset=utf-8');

try {
    $root = new PDO('mysql:host=' . DB_HOST . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $root->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4');
    $pdo = db();

    $pdo->exec("CREATE TABLE IF NOT EXISTS farmers (
        id VARCHAR(10) PRIMARY KEY, name VARCHAR(100) NOT NULL, hp VARCHAR(20) NOT NULL, addr VARCHAR(200) NOT NULL) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(30) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','petani') NOT NULL, farmer_id VARCHAR(10) NULL) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS prices (
        id INT AUTO_INCREMENT PRIMARY KEY, price INT NOT NULL, effective_date DATE NOT NULL) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(20) PRIMARY KEY, dt DATETIME NOT NULL, farmer_id VARCHAR(10) NOT NULL, farmer_name VARCHAR(100) NOT NULL,
        vehicle VARCHAR(20) NOT NULL, gross DECIMAL(10,2) NOT NULL, tare DECIMAL(10,2) NOT NULL, net DECIMAL(10,2) NOT NULL,
        price INT NOT NULL, cut INT NOT NULL DEFAULT 0, total INT NOT NULL,
        method ENUM('Tunai','Transfer') NOT NULL, status ENUM('Lunas','Menunggu') NOT NULL) ENGINE=InnoDB");

    if ($pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
        echo "Database sudah terisi. Tidak ada yang diubah.\nBuka: ../index.html (lewat http://localhost/ram-sawit/)";
        exit;
    }

    // Akun admin + petani contoh
    $addUser = $pdo->prepare('INSERT INTO users (username, password_hash, role, farmer_id) VALUES (?,?,?,?)');
    $addUser->execute(['admin', password_hash('admin123', PASSWORD_DEFAULT), 'admin', null]);

    $farmers = [['Budi Santoso', '081234567801', 'Desa Sukamaju'], ['Siti Aminah', '081234567802', 'Desa Makmur'],
        ['Agus Salim', '081234567803', 'Dusun Karya'], ['Rina Wati', '081234567804', 'Desa Sejahtera'], ['Joko Prasetyo', '081234567805', 'Desa Harapan']];
    $addFarmer = $pdo->prepare('INSERT INTO farmers (id, name, hp, addr) VALUES (?,?,?,?)');
    foreach ($farmers as $i => $f) {
        $id = 'P' . str_pad($i + 1, 3, '0', STR_PAD_LEFT);
        $addFarmer->execute([$id, $f[0], $f[1], $f[2]]);
        $addUser->execute([strtolower($id), password_hash('petani123', PASSWORD_DEFAULT), 'petani', $id]);
    }

    // Riwayat harga
    $addPrice = $pdo->prepare('INSERT INTO prices (price, effective_date) VALUES (?,?)');
    foreach ([[-20, 2200], [-10, 2350], [-3, 2400]] as $p) $addPrice->execute([$p[1], date('Y-m-d', strtotime($p[0] . ' days'))]);

    // Transaksi contoh 15 hari terakhir
    mt_srand(7);
    $addTx = $pdo->prepare('INSERT INTO transactions (id, dt, farmer_id, farmer_name, vehicle, gross, tare, net, price, cut, total, method, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for ($d = 14; $d >= 0; $d--) {
        $date = date('Y-m-d', strtotime("-$d days"));
        $price = $d >= 10 ? 2200 : ($d >= 3 ? 2350 : 2400);
        $n = mt_rand(2, 4);
        for ($k = 1; $k <= $n; $k++) {
            $i = mt_rand(0, 4); $fid = 'P' . str_pad($i + 1, 3, '0', STR_PAD_LEFT);
            $tare = 3000 + mt_rand(0, 4) * 100; $net = 500 + mt_rand(0, 29) * 100; $cut = mt_rand(0, 2) * 10000;
            $method = mt_rand(0, 1) ? 'Tunai' : 'Transfer';
            $addTx->execute([sprintf('TRX-%s-%03d', str_replace('-', '', $date), $k), sprintf('%s %02d:15:00', $date, 7 + $k * 2), $fid, $farmers[$i][0],
                'BM ' . mt_rand(1000, 9999) . ' AB', $tare + $net, $tare, $net, $price, $cut, $net * $price - $cut,
                $method, ($method === 'Tunai' || $d > 1) ? 'Lunas' : 'Menunggu']);
        }
    }
    echo "Berhasil! Database '" . DB_NAME . "' siap.\n\nLogin Admin : admin / admin123\nLogin Petani: p001 / petani123\n\nBuka aplikasi: http://localhost/ram-sawit/";
} catch (PDOException $e) {
    http_response_code(500);
    echo "Gagal: " . $e->getMessage() . "\nPastikan MySQL di XAMPP sudah Start dan pengaturan di config.php benar.";
}
