require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  PermissionsBitField,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
} = require("discord.js");

const djs = require("discord.js");

if (typeof ContainerBuilder !== "function" || !MessageFlags.IsComponentsV2) {
  console.error(`discord.js v${djs.version} belum mendukung Components V2. Jalankan: npm install`);
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const configPath = path.join(ROOT, "config.json");
const dataPath = path.join(ROOT, "bot-data.json");

if (!fs.existsSync(configPath)) {
  console.error("config.json belum ada. Salin config.example.json menjadi config.json lalu isi ID yang diperlukan.");
  process.exit(1);
}

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN belum diisi di file .env");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (error) {
  console.error("config.json tidak valid:", error.message);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Channel],
});

process.on("unhandledRejection", error => console.error("[UNHANDLED REJECTION]", error));
process.on("uncaughtException", error => console.error("[UNCAUGHT EXCEPTION]", error));

let state = { levels: {}, invites: {}, products: {}, tickets: {} };

try {
  if (fs.existsSync(dataPath)) {
    const loaded = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const asObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
    state = {
      levels: asObject(loaded.levels),
      invites: asObject(loaded.invites),
      products: asObject(loaded.products),
      tickets: asObject(loaded.tickets),
    };
  }
} catch (error) {
  console.error("Gagal membaca bot-data.json:", error.message);
}

function saveState() {
  try {
    const tempPath = `${dataPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempPath, dataPath);
  } catch (error) {
    console.error("Gagal menyimpan bot-data.json:", error.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch (error) {
    console.error("Gagal menyimpan config.json:", error.message);
    throw error;
  }
}

function keyFor(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getLevel(guildId, userId) {
  return state.levels[keyFor(guildId, userId)] || null;
}

function saveLevel(guildId, userId, xp, level) {
  state.levels[keyFor(guildId, userId)] = {
    guild_id: guildId,
    user_id: userId,
    xp,
    level,
  };
  saveState();
}

function topLevels(guildId) {
  return Object.values(state.levels)
    .filter(row => row.guild_id === guildId)
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, 10);
}

function getInvites(guildId, userId) {
  return state.invites[keyFor(guildId, userId)] || null;
}

function addInvite(guildId, userId) {
  const key = keyFor(guildId, userId);
  if (!state.invites[key]) {
    state.invites[key] = { guild_id: guildId, user_id: userId, uses: 0 };
  }
  state.invites[key].uses += 1;
  saveState();
}

function topInvites(guildId) {
  return Object.values(state.invites)
    .filter(row => row.guild_id === guildId)
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 10);
}

function getProducts(guildId) {
  if (!Array.isArray(state.products[guildId])) state.products[guildId] = [];
  return state.products[guildId];
}

function addProduct(guildId, data) {
  const list = getProducts(guildId);
  const id = list.reduce((highest, product) => Math.max(highest, Number(product.id) || 0), 0) + 1;
  const product = { id, ...data, created_at: Date.now() };
  list.push(product);
  saveState();
  return product;
}

function removeProduct(guildId, id) {
  const list = getProducts(guildId);
  const index = list.findIndex(product => Number(product.id) === Number(id));
  if (index < 0) return null;
  const [removed] = list.splice(index, 1);
  saveState();
  return removed;
}

function editProduct(guildId, id, changes) {
  const product = getProducts(guildId).find(item => Number(item.id) === Number(id));
  if (!product) return null;
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      product[key] = String(value).trim();
    }
  }
  product.updated_at = Date.now();
  saveState();
  return product;
}

const inviteCache = new Map();
const xpCooldown = new Map();

function logError(error) {
  console.error("[ERROR]", error?.stack || error?.message || error);
}

function validId(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function getTextChannel(guild, id) {
  if (!validId(id)) return null;
  const channel = guild.channels.cache.get(id);
  return channel && channel.isTextBased() && typeof channel.send === "function" ? channel : null;
}

function xpNeeded(level) {
  return 5 * level * level + 50 * level + 100;
}

function formatPrice(price) {
  const value = String(price ?? "").trim();
  if (/^\d+$/.test(value)) return `Rp ${Number(value).toLocaleString("id-ID")}`;
  return value;
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\/\S+$/i.test(value);
}

function makeBox(title, sections = []) {
  const box = new ContainerBuilder();
  // Judul hanya ditampilkan jika memang diberikan. Untuk produk, biarkan isi
  // yang dikirim admin tampil apa adanya tanpa judul otomatis seperti "Product".
  if (typeof title === "string" && title.trim()) {
    box.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title.trim()}`));
  }

  for (const section of sections) {
    box.addSeparatorComponents(new SeparatorBuilder());
    box.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(section)));
  }
  return box;
}

function boxPayload(title, sections, extra = {}) {
  return {
    ...extra,
    components: [makeBox(title, sections)],
    flags: (extra.flags || 0) | MessageFlags.IsComponentsV2,
  };
}

function productsPayload(guildId, page = 1) {
  const list = getProducts(guildId);
  const totalPages = Math.max(1, Math.ceil(list.length / 8));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const rows = list.slice((current - 1) * 8, current * 8);
  // Jangan menambahkan judul otomatis; tampilkan hanya daftar item yang dibuat admin.
  const box = new ContainerBuilder();

  if (!rows.length) {
    box.addTextDisplayComponents(new TextDisplayBuilder().setContent("Belum ada item yang ditambahkan."));
  }

  for (const product of rows) {
    box.addSeparatorComponents(new SeparatorBuilder());
    const content = `**#${product.id} • ${product.name}**\n💰 ${formatPrice(product.price)}\n${product.description || "Tidak ada deskripsi."}`;
    const display = new TextDisplayBuilder().setContent(content);
    if (isHttpUrl(product.image)) {
      box.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(display)
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(product.image))
      );
    } else {
      box.addTextDisplayComponents(display);
    }
  }

  box.addSeparatorComponents(new SeparatorBuilder());
  box.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`*Halaman ${current}/${totalPages} • Total ${list.length} item*`)
  );
  return { components: [box], flags: MessageFlags.IsComponentsV2 };
}

function ticketPanelPayload() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:create").setLabel("Buat Ticket Order").setEmoji("🎫").setStyle(ButtonStyle.Primary)
  );
  return { content: "Mau order produk atau jasa MyfliZ? Klik tombol di bawah untuk membuat ticket pribadi bersama staff.", components: [row] };
}

function ticketCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:close").setLabel("Tutup Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );
}

async function replyError(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(logError);
  }
  return interaction.reply(payload).catch(logError);
}

function needManageGuild(interaction) {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return false;
  void replyError(interaction, "Kamu perlu permission **Manage Server** untuk menggunakan command ini.");
  return true;
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag} | discord.js v${djs.version} | Node ${process.version}`);

  for (const guild of readyClient.guilds.cache.values()) {
    const me = guild.members.me;
    console.log(`[CHECK] ${guild.name}: ManageRoles=${Boolean(me?.permissions.has(PermissionsBitField.Flags.ManageRoles))}, ManageGuild=${Boolean(me?.permissions.has(PermissionsBitField.Flags.ManageGuild))}`);

    for (const key of ["welcomeChannelId", "leaveChannelId", "inviteLogChannelId", "boosterLogChannelId", "systemLogChannelId", "levelUpChannelId"]) {
      if (config[key]) {
        console.log(`[CHECK] ${key}: ${getTextChannel(guild, config[key]) ? "OK" : "CHANNEL TIDAK DITEMUKAN / BOT TIDAK BISA MELIHAT"}`);
      }
    }

    try {
      const invites = await guild.invites.fetch();
      inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses ?? 0])));
    } catch (error) {
      console.warn(`Tidak bisa membaca invite di ${guild.name}. Berikan permission Manage Server. Detail: ${error.message}`);
    }
  }
});

client.on(Events.InviteCreate, invite => {
  const cached = inviteCache.get(invite.guild.id) || new Map();
  cached.set(invite.code, invite.uses ?? 0);
  inviteCache.set(invite.guild.id, cached);
});

client.on(Events.InviteDelete, invite => {
  const cached = inviteCache.get(invite.guild.id);
  if (cached) cached.delete(invite.code);
});

client.on(Events.GuildMemberAdd, async member => {
  console.log(`[JOIN] ${member.user.tag}`);

  if (validId(config.autoRoleId)) {
    const role = member.guild.roles.cache.get(config.autoRoleId);
    if (role) {
      try {
        await member.roles.add(role, "Auto role untuk member baru");
        const systemLog = getTextChannel(member.guild, config.systemLogChannelId);
        if (systemLog) {
          await systemLog.send(boxPayload("Auto Role", [
            `Member: ${member}`,
            `Role diberikan: <@&${role.id}>`,
          ])).catch(logError);
        }
      } catch (error) {
        console.error("Gagal memberi auto role:", error.message);
      }
    }
  }

  const welcomeChannel = getTextChannel(member.guild, config.welcomeChannelId);
  if (welcomeChannel) {
    const message = (config.welcomeMessage || "Welcome {user} to the server!")
      .replaceAll("{user}", `<@${member.id}>`)
      .replaceAll("{server}", member.guild.name)
      .replaceAll("{count}", String(member.guild.memberCount));

    try {
      await welcomeChannel.send(boxPayload(config.welcomeTitle || "Welcome", [
        message,
        `**Member Count:** ${member.guild.memberCount}`,
        `*${config.welcomeFooter || "Please read the rules and enjoy!"}*`,
      ]));
    } catch (error) {
      console.error("Gagal mengirim welcome:", error.message);
    }
  }

  try {
    const previous = inviteCache.get(member.guild.id) || new Map();
    const currentInvites = await member.guild.invites.fetch();
    const usedInvite = currentInvites.find(invite => (invite.uses ?? 0) > (previous.get(invite.code) ?? 0));
    inviteCache.set(member.guild.id, new Map(currentInvites.map(invite => [invite.code, invite.uses ?? 0])));

    const logChannel = getTextChannel(member.guild, config.inviteLogChannelId);
    if (usedInvite?.inviter && usedInvite.inviter.id !== member.id) {
      addInvite(member.guild.id, usedInvite.inviter.id);
      if (logChannel) {
        await logChannel.send(boxPayload("Invite Tracked", [
          `${member} bergabung menggunakan invite milik ${usedInvite.inviter}.`,
          `**Kode invite:** ${usedInvite.code}`,
        ])).catch(logError);
      }
    } else if (logChannel) {
      await logChannel.send(boxPayload("Invite Tracked", [
        `Member baru: ${member}.`,
        "Invite yang digunakan tidak dapat dipastikan (misalnya vanity URL atau cache belum tersedia).",
      ])).catch(logError);
    }
  } catch (error) {
    console.warn("Invite tracker tidak dapat membaca invite. Pastikan bot punya permission Manage Server.", error.message);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  console.log(`[LEAVE] ${member.user?.tag || member.id}`);
  const channel = getTextChannel(member.guild, config.leaveChannelId)
    || getTextChannel(member.guild, config.systemLogChannelId);
  if (!channel) return;

  const sections = [
    `**${member.user?.username || "Member"}** (<@${member.id}>) telah keluar dari server.`,
    `**Member Count:** ${member.guild.memberCount}`,
  ];
  if (member.joinedTimestamp) {
    sections.push(`**Bergabung:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`);
  }

  try {
    await channel.send(boxPayload(config.leaveTitle || "Member Left", sections));
  } catch (error) {
    console.error("Gagal mengirim leave log:", error.message);
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const wasBoosting = Boolean(oldMember.premiumSince);
  const isBoosting = Boolean(newMember.premiumSince);
  if (wasBoosting === isBoosting) return;

  const logChannel = getTextChannel(newMember.guild, config.boosterLogChannelId)
    || getTextChannel(newMember.guild, config.systemLogChannelId);
  const roleId = config.boosterRoleId;
  const role = validId(roleId) ? newMember.guild.roles.cache.get(roleId) : null;

  try {
    const lines = [];
    if (isBoosting) {
      lines.push(`${newMember} sekarang melakukan boost server. Terima kasih! 💜`);
      if (role) {
        if (!newMember.roles.cache.has(roleId)) await newMember.roles.add(role, "Server booster role");
        lines.push(`Role diberikan: <@&${roleId}>`);
      }
    } else {
      lines.push(`${newMember} tidak lagi melakukan boost server.`);
      if (role) {
        if (newMember.roles.cache.has(roleId)) await newMember.roles.remove(role, "Server boost berakhir");
        lines.push(`Role dihapus: <@&${roleId}>`);
      }
    }
    lines.push(`**Total Boost:** ${newMember.guild.premiumSubscriptionCount ?? 0}`);
    if (logChannel) await logChannel.send(boxPayload("Booster", lines)).catch(logError);
  } catch (error) {
    console.error("Gagal memperbarui booster role:", error.message);
  }
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const now = Date.now();
  const key = keyFor(message.guild.id, message.author.id);
  const cooldownMs = Math.max(0, Number(config.xpCooldownSeconds ?? 60)) * 1000;
  if (now - (xpCooldown.get(key) || 0) < cooldownMs) return;
  xpCooldown.set(key, now);

  const min = Math.max(1, Number(config.xpMin ?? 15));
  const max = Math.max(min, Number(config.xpMax ?? 25));
  const earned = Math.floor(Math.random() * (max - min + 1)) + min;
  const old = getLevel(message.guild.id, message.author.id) || { xp: 0, level: 0 };

  let xp = old.xp + earned;
  let level = old.level;
  let leveledUp = false;

  while (xp >= xpNeeded(level)) {
    xp -= xpNeeded(level);
    level += 1;
    leveledUp = true;
  }

  saveLevel(message.guild.id, message.author.id, xp, level);

  if (leveledUp) {
    const destination = getTextChannel(message.guild, config.levelUpChannelId) || message.channel;
    destination.send(boxPayload("Level Up!", [
      `GG ${message.author}! Kamu naik ke **Level ${level}** 🎉`,
      `**XP saat ini:** ${xp} / ${xpNeeded(level)}`,
    ])).catch(logError);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    try {
      if (!interaction.guild) return replyError(interaction, "Ticket hanya bisa dibuat di server.");
      if (interaction.customId === "ticket:create") {
        const guild = interaction.guild;
        const existing = Object.values(state.tickets).find(ticket => ticket.guild_id === guild.id && ticket.user_id === interaction.user.id && ticket.status === "open");
        if (existing) {
          const existingChannel = guild.channels.cache.get(existing.channel_id);
          if (existingChannel) return interaction.reply({ content: `Kamu masih punya ticket terbuka: ${existingChannel}`, flags: MessageFlags.Ephemeral });
          existing.status = "closed"; saveState();
        }
        const categoryId = config.ticketCategoryId || null;
        const staffRoleId = config.ticketStaffRoleId || null;
        const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "customer";
        const overwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] },
        ];
        if (staffRoleId && guild.roles.cache.has(staffRoleId)) overwrites.push({ id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
        const channel = await guild.channels.create({ name: `order-${safeName}`.slice(0, 90), type: ChannelType.GuildText,
          parent: categoryId && guild.channels.cache.get(categoryId)?.type === ChannelType.GuildCategory ? categoryId : undefined,
          permissionOverwrites: overwrites, topic: `Ticket order untuk ${interaction.user.tag} (${interaction.user.id})`, reason: `Ticket order dibuat oleh ${interaction.user.tag}` });
        state.tickets[channel.id] = { guild_id: guild.id, channel_id: channel.id, user_id: interaction.user.id, status: "open", created_at: Date.now() }; saveState();
        await channel.send({ content: `${interaction.user}${staffRoleId && guild.roles.cache.has(staffRoleId) ? ` <@&${staffRoleId}>` : ""}\n**Ticket Order MyfliZ**\nJelaskan produk/jasa yang ingin dipesan, detail kebutuhan, dan bukti pembayaran jika sudah ada. Staff akan membantu di sini.`,
          components: [ticketCloseRow()], allowedMentions: { users: [interaction.user.id], roles: staffRoleId ? [staffRoleId] : [] } });
        return interaction.reply({ content: `Ticket order kamu berhasil dibuat: ${channel}`, flags: MessageFlags.Ephemeral });
      }
      if (interaction.customId === "ticket:close") {
        const ticket = state.tickets[interaction.channelId];
        if (!ticket || ticket.status !== "open") return replyError(interaction, "Ticket ini sudah ditutup atau tidak terdaftar.");
        const isOwner = interaction.user.id === ticket.user_id;
        const hasManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
        const isStaff = config.ticketStaffRoleId && interaction.member?.roles?.cache?.has(config.ticketStaffRoleId);
        if (!isOwner && !hasManage && !isStaff) return replyError(interaction, "Hanya pembuat ticket atau staff yang boleh menutup ticket ini.");
        ticket.status = "closed"; ticket.closed_at = Date.now(); ticket.closed_by = interaction.user.id; saveState();
        await interaction.reply({ content: `Ticket ditutup oleh ${interaction.user}. Channel akan dihapus dalam 5 detik.` });
        setTimeout(() => interaction.channel?.delete("Ticket order ditutup").catch(logError), 5000);
        return;
      }
    } catch (error) {
      console.error("[TICKET ERROR]", error);
      return replyError(interaction, "Gagal memproses ticket. Pastikan bot punya izin Manage Channels, View Channel, dan Send Messages.");
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guildId } = interaction;
  console.log(`[CMD] /${commandName} by ${interaction.user.tag}`);

  if (!interaction.guild) {
    return replyError(interaction, "Command ini hanya bisa digunakan di server.");
  }

  try {
    if (commandName === "ping") {
      return interaction.reply(boxPayload("Pong", [
        `discord.js v${djs.version}`,
        `Latency: ${client.ws.ping}ms`,
      ]));
    }

    if (commandName === "rank") {
      const target = interaction.options.getUser("user") || interaction.user;
      const data = getLevel(guildId, target.id) || { xp: 0, level: 0 };
      return interaction.reply(boxPayload(`Rank • ${target.username}`, [
        `**Member:** ${target}`,
        `**Level:** ${data.level}`,
        `**XP:** ${data.xp} / ${xpNeeded(data.level)}`,
        `**Sisa XP untuk level berikutnya:** ${Math.max(0, xpNeeded(data.level) - data.xp)}`,
      ]));
    }

    if (commandName === "leaderboard") {
      const rows = topLevels(guildId);
      const description = rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — Level **${row.level}** (${row.xp} XP)`).join("\n")
        : "Belum ada data level.";
      return interaction.reply(boxPayload("Level Leaderboard", [description]));
    }

    if (commandName === "invites") {
      const target = interaction.options.getUser("user") || interaction.user;
      const data = getInvites(guildId, target.id);
      return interaction.reply(boxPayload("Invite Count", [
        `${target} memiliki **${data?.uses ?? 0}** invite yang tercatat.`,
      ]));
    }

    if (commandName === "invitetop") {
      const rows = topInvites(guildId);
      const description = rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — **${row.uses}** invite`).join("\n")
        : "Belum ada data invite.";
      return interaction.reply(boxPayload("Invite Leaderboard", [description]));
    }

    if (commandName === "setwelcome") {
      if (needManageGuild(interaction)) return;
      const channel = interaction.options.getChannel("channel", true);
      if (!channel.isTextBased()) return replyError(interaction, "Pilih channel teks.");
      config.welcomeChannelId = channel.id;
      saveConfig();
      return interaction.reply(boxPayload("Welcome Settings", [`Channel welcome diatur ke ${channel}.`], { flags: MessageFlags.Ephemeral }));
    }

    if (commandName === "setleave") {
      if (needManageGuild(interaction)) return;
      const channel = interaction.options.getChannel("channel", true);
      if (!channel.isTextBased()) return replyError(interaction, "Pilih channel teks.");
      config.leaveChannelId = channel.id;
      saveConfig();
      return interaction.reply(boxPayload("Leave Settings", [`Channel leave log diatur ke ${channel}.`], { flags: MessageFlags.Ephemeral }));
    }

    if (commandName === "ticket-setup") {
      if (needManageGuild(interaction)) return;
      const channel = interaction.options.getChannel("channel", true);
      const category = interaction.options.getChannel("kategori");
      const staffRole = interaction.options.getRole("staff");
      const permissions = channel.permissionsFor(interaction.guild.members.me);
      if (!permissions?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return replyError(interaction, `Bot tidak punya izin mengirim pesan di ${channel}.`);
      config.ticketCategoryId = category?.id || ""; config.ticketStaffRoleId = staffRole?.id || ""; saveConfig();
      await channel.send(ticketPanelPayload());
      return interaction.reply({ content: `✅ Panel ticket berhasil dikirim ke ${channel}. Customer bisa klik **Buat Ticket Order** untuk membuka channel privat.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === "product-add") {
      if (needManageGuild(interaction)) return;
      const name = interaction.options.getString("nama", true).trim();
      const price = interaction.options.getString("harga", true).trim();
      const description = interaction.options.getString("deskripsi", true).trim();
      const image = interaction.options.getString("gambar");
      if (image && !isHttpUrl(image)) return replyError(interaction, "URL gambar harus diawali http:// atau https://.");
      const product = addProduct(guildId, { name, price, description, image: image || "" });
      return interaction.reply({
        content: `✅ Produk **${product.name}** berhasil disimpan dengan ID **${product.id}**. Gunakan \`/product-list\` untuk menampilkan katalog di channel mana pun.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (commandName === "product-list") {
      const chosenChannel = interaction.options.getChannel("channel");
      const channel = chosenChannel || interaction.channel;
      const me = interaction.guild.members.me;
      if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
        return replyError(interaction, "Pilih channel teks yang valid.");
      }
      const permissions = channel.permissionsFor(me);
      if (!permissions?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
        return replyError(interaction, `Bot tidak punya izin melihat atau mengirim pesan di ${channel}.`);
      }
      await channel.send(productsPayload(guildId));
      return interaction.reply({
        content: `📦 List Produk berhasil dikirim ke ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (commandName === "product-delete") {
      if (needManageGuild(interaction)) return;
      const id = interaction.options.getInteger("id", true);
      const removed = removeProduct(guildId, id);
      if (!removed) return replyError(interaction, `Item dengan ID **${id}** tidak ditemukan.`);
      return interaction.reply({
        content: `🗑️ Item **${removed.name}** (ID ${removed.id}) berhasil dihapus.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (commandName === "product-edit") {
      if (needManageGuild(interaction)) return;
      const id = interaction.options.getInteger("id", true);
      const changes = {
        name: interaction.options.getString("nama"),
        price: interaction.options.getString("harga"),
        description: interaction.options.getString("deskripsi"),
        image: interaction.options.getString("gambar"),
      };
      if (changes.image && !isHttpUrl(changes.image)) {
        return replyError(interaction, "URL gambar harus diawali http:// atau https://.");
      }
      const updated = editProduct(guildId, id, changes);
      if (!updated) return replyError(interaction, `Item dengan ID **${id}** tidak ditemukan.`);
      return interaction.reply({
        content: `✏️ Produk **${updated.name}** berhasil diperbarui.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Command lama tetap didukung untuk mengirim teks bebas ke channel pilihan.
    if (commandName === "addproduct") {
      if (needManageGuild(interaction)) return;
      const channel = interaction.options.getChannel("channel", true);
      const text = interaction.options.getString("text", true).replace(/\\n/g, "\n");
      const me = interaction.guild.members.me;
      if (!channel.isTextBased() || typeof channel.send !== "function") {
        return replyError(interaction, "Channel tujuan harus berupa channel teks.");
      }
      const permissions = channel.permissionsFor(me);
      if (!permissions?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
        return replyError(interaction, `Bot tidak punya izin melihat atau mengirim pesan di ${channel}.`);
      }
      await channel.send(boxPayload("", [text]));
      return interaction.reply({ content: `Pesan produk berhasil dikirim ke ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    // Command terdaftar tapi belum ditangani akan memberi respons, bukan timeout.
    return replyError(interaction, `Command /${commandName} sudah terdaftar, tetapi handler-nya belum dibuat di src/index.js.`);
  } catch (error) {
    console.error(`Gagal menjalankan /${commandName}:`, error);
    return replyError(interaction, "Terjadi kesalahan saat menjalankan command. Cek terminal bot untuk detail error.");
  }
});

client.on(Events.Error, error => console.error("[CLIENT ERROR]", error));
client.on(Events.Warn, warning => console.warn("[WARN]", warning));

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("[LOGIN GAGAL]", error.message);
  console.error("Cek token serta aktifkan Server Members Intent dan Message Content Intent di Discord Developer Portal.");
  process.exit(1);
});
