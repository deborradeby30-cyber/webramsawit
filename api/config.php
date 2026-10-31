<?php
// Pengaturan koneksi database. Sesuaikan jika MySQL Anda memakai password.
const DB_HOST = 'localhost';
const DB_NAME = 'ram_sawit';
const DB_USER = 'root';   // bawaan XAMPP
const DB_PASS = '';       // bawaan XAMPP: kosong

date_default_timezone_set('Asia/Jakarta');

// Membuat koneksi PDO satu kali, lalu dipakai ulang.
function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}
