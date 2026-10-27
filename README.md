# MyfliZ Discord Bot — Full Update

## Fitur yang disertakan
- `/ping`
- `/rank [user]`
- `/leaderboard`
- `/invites [user]`
- `/invitetop`
- `/setwelcome channel`
- `/setleave channel`
- `/addproduct channel text`
- Welcome message, leave log, auto role, booster log/role, invite tracking, XP/level system
- Error response untuk command yang sudah terdaftar tetapi handler belum dibuat

## Persyaratan
- Node.js 20 atau lebih baru
- Discord bot token dan Application ID dari Discord Developer Portal
- Aktifkan **Server Members Intent** dan **Message Content Intent** di tab Bot pada Developer Portal
- Berikan permission bot: View Channels, Send Messages, Read Message History, Manage Roles (untuk auto/booster role), Manage Server (untuk membaca invite)

## Instalasi
1. Ekstrak folder project.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env`, lalu isi `DISCORD_TOKEN`, `CLIENT_ID`, dan `GUILD_ID`.
4. Salin `config.example.json` menjadi `config.json`. Isi ID channel/role yang mau digunakan; field yang tidak dipakai boleh tetap string kosong.
5. Jalankan `npm run check`.
6. Daftarkan slash command: `npm run deploy`.
7. Jalankan bot: `npm start`.

## Menambahkan slash command baru
1. Tambahkan definisi command ke array `commands` di `deploy-commands.js`.
2. Tambahkan implementasinya ke handler `InteractionCreate` di `src/index.js`.
3. Jalankan `npm run deploy` lagi.
4. Restart bot dengan `npm start` (atau restart proses bot yang sedang berjalan).

Mendaftarkan command saja tidak membuat fitur berjalan; command harus punya handler. Deploy dengan `GUILD_ID` hanya mengelola command pada server itu. Jangan campur deployment global dan guild untuk command yang sama saat testing.

## Catatan
- `bot-data.json` dibuat otomatis untuk menyimpan XP dan invite.
- Backup `bot-data.json` secara berkala.
- Jangan bagikan file `.env` atau token bot.
- Role bot harus berada di atas role yang akan diberikan/dihapus di pengaturan role Discord.


## Sistem List Produk (v1.2.0)

Katalog produk tersimpan permanen di `bot-data.json` dan tetap ada setelah bot restart.

- `/product-add` — tambah item (nama, harga, deskripsi, URL gambar opsional). Perlu permission **Manage Server**.
- `/product-list` — tampilkan katalog di channel saat ini atau pilih channel teks mana pun lewat opsi `channel`.
- `/product-edit` — edit item berdasarkan ID. Perlu permission **Manage Server**.
- `/product-delete` — hapus item berdasarkan ID. Perlu permission **Manage Server**.
- `/addproduct` — command lama tetap tersedia untuk mengirim teks bebas ke channel tertentu.

Contoh:
1. Jalankan `/product-add nama: Hosting Bot harga: 15000 deskripsi: Hosting bot Discord 24/7`.
2. Jalankan `/product-list channel: #product-list` untuk mengirim katalog ke channel pilihan.
3. Setelah produk diubah, jalankan `/product-list` lagi untuk mengirim katalog terbaru. Pesan katalog lama tidak diedit otomatis.

Setelah update, jalankan `npm run deploy`, lalu restart bot dengan `npm start`.
Bot harus punya izin **View Channel** dan **Send Messages** di channel tujuan.

## Sistem Ticket Order

1. Jalankan `npm run deploy` setelah update source code.
2. Pastikan bot memiliki permission **Manage Channels**, **View Channels**, **Send Messages**, dan **Read Message History**.
3. Di server Discord, jalankan `/ticket-setup` lalu pilih channel panel. Opsional: pilih kategori tempat ticket dibuat dan role staff yang dapat melihat ticket.
4. Customer klik tombol **Buat Ticket Order**. Bot membuat channel privat yang hanya dapat dilihat customer tersebut, staff (jika dipilih), dan bot.
5. Customer atau staff dapat menekan **Tutup Ticket** untuk menutup dan menghapus channel setelah 5 detik.

Setiap customer hanya bisa memiliki satu ticket terbuka pada satu waktu. Data ticket disimpan di `bot-data.json`.
