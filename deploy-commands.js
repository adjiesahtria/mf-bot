require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Isi DISCORD_TOKEN dan CLIENT_ID di file .env");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Cek apakah bot aktif"),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Lihat level dan XP member")
    .addUserOption(option => option.setName("user").setDescription("Member yang ingin dilihat").setRequired(false)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Lihat 10 member dengan level tertinggi"),

  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Lihat jumlah invite yang tercatat")
    .addUserOption(option => option.setName("user").setDescription("Member yang ingin dilihat").setRequired(false)),

  new SlashCommandBuilder()
    .setName("invitetop")
    .setDescription("Lihat 10 pengundang teratas"),

  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Atur channel welcome")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("Channel untuk welcome")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName("setleave")
    .setDescription("Atur channel leave log")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("Channel untuk leave log")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName("product-add")
    .setDescription("Tambah item ke List Produk")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option.setName("nama").setDescription("Nama produk").setRequired(true).setMaxLength(100))
    .addStringOption(option => option.setName("harga").setDescription("Harga, contoh 25000 atau Mulai Rp25.000").setRequired(true).setMaxLength(100))
    .addStringOption(option => option.setName("deskripsi").setDescription("Deskripsi produk").setRequired(true).setMaxLength(1000))
    .addStringOption(option => option.setName("gambar").setDescription("URL gambar produk (opsional)").setRequired(false).setMaxLength(500)),

  new SlashCommandBuilder()
    .setName("product-list")
    .setDescription("Tampilkan List Produk di channel mana pun")
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("Channel tujuan; kosongkan untuk channel saat ini")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName("product-edit")
    .setDescription("Edit produk berdasarkan ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option.setName("id").setDescription("ID produk").setRequired(true).setMinValue(1))
    .addStringOption(option => option.setName("nama").setDescription("Nama baru (opsional)").setRequired(false).setMaxLength(100))
    .addStringOption(option => option.setName("harga").setDescription("Harga baru (opsional)").setRequired(false).setMaxLength(100))
    .addStringOption(option => option.setName("deskripsi").setDescription("Deskripsi baru (opsional)").setRequired(false).setMaxLength(1000))
    .addStringOption(option => option.setName("gambar").setDescription("URL gambar baru (opsional)").setRequired(false).setMaxLength(500)),

  new SlashCommandBuilder()
    .setName("product-delete")
    .setDescription("Hapus produk berdasarkan ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option.setName("id").setDescription("ID produk yang dihapus").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Kirim panel untuk customer membuat ticket order")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("Channel untuk panel ticket")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .addChannelOption(option => option
      .setName("kategori")
      .setDescription("Kategori channel ticket (opsional)")
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(false))
    .addRoleOption(option => option
      .setName("staff")
      .setDescription("Role yang boleh melihat dan menangani ticket (opsional)")
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName("addproduct")
    .setDescription("Kirim pesan produk ke channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("Channel tujuan")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .addStringOption(option => option
      .setName("text")
      .setDescription("Isi produk; gunakan \\n untuk baris baru")
      .setRequired(true)
      .setMaxLength(4000)),
].map(command => command.toJSON());

(async () => {
  try {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);

    const registered = await rest.put(route, { body: commands });
    console.log(`[DEPLOY OK] ${registered.length} command terdaftar.`);
    console.log(`Scope: ${GUILD_ID ? `server ${GUILD_ID}` : "global"}`);
    console.log(registered.map(command => `/${command.name}`).join(" | "));
    if (!GUILD_ID) console.log("Command global bisa memerlukan waktu untuk muncul. Untuk pengujian cepat, isi GUILD_ID.");
  } catch (error) {
    console.error("[DEPLOY GAGAL]", error);
    process.exitCode = 1;
  }
})();
