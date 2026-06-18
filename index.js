const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');

let config = {
  token: process.env.TOKEN, clientId: process.env.CLIENT_ID,
  verifiedRole: process.env.VERIFIED_ROLE || 'Member',
  welcomeChannel: process.env.WELCOME_CHANNEL || 'welcome',
  modLogChannel: process.env.MOD_LOG_CHANNEL || 'mod-logs',
  ticketCategory: process.env.TICKET_CATEGORY || 'Tickets',
  ticketRole: process.env.TICKET_ROLE || 'Support Team',
  autoMod: { badWords: ['spam'], maxCaps: 0.7, maxPings: 5, maxLines: 10, strikeLimit: 3 },
  levels: { messageXp: 15, voiceXpPerMinute: 20, xpCooldown: 60 },
  economy: { dailyAmount: 500, workMin: 50, workMax: 200 },
  music: { maxQueueSize: 100, defaultVolume: 50 }
};
try { const fc = require('./config.json'); Object.assign(config, fc); } catch (e) {}

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

const xpCD = new Set();
async function addXp(m) {
  if (xpCD.has(m.id)) return;
  const l = readJSON('levels.json');
  if (!l[m.id]) l[m.id] = { level: 1, xp: 0, totalXp: 0 };
  l[m.id].xp += config.levels.messageXp; l[m.id].totalXp += config.levels.messageXp;
  if (l[m.id].xp >= l[m.id].level * 100 + 100) { l[m.id].level++; l[m.id].xp = 0;
    const c = m.guild.channels.cache.find(ch => ch.name === config.welcomeChannel);
    if (c) c.send({ content: `🎉 ${m} وصل للمستوى **${l[m.id].level}**` }); }
  writeJSON('levels.json', l); xpCD.add(m.id);
  setTimeout(() => xpCD.delete(m.id), config.levels.xpCooldown * 1000);
}
async function handleVoiceXp(m) {
  const l = readJSON('levels.json');
  if (!l[m.id]) l[m.id] = { level: 1, xp: 0, totalXp: 0 };
  l[m.id].xp += config.levels.voiceXpPerMinute; l[m.id].totalXp += config.levels.voiceXpPerMinute;
  if (l[m.id].xp >= l[m.id].level * 100 + 100) { l[m.id].level++; l[m.id].xp = 0;
    const c = m.guild.channels.cache.find(ch => ch.name === config.welcomeChannel);
    if (c) c.send({ content: `🎉 ${m} وصل للمستوى **${l[m.id].level}**` }); }
  writeJSON('levels.json', l);
}

const commands = [
  { name: 'setup-verify', description: 'Setup verification button' }, { name: 'verify', description: 'Verify yourself' },
  { name: 'kick', description: 'Kick member', options: [{ type: 6, name: 'user', description: 'User', required: true }, { type: 3, name: 'reason', description: 'Reason' }] },
  { name: 'ban', description: 'Ban member', options: [{ type: 6, name: 'user', description: 'User', required: true }, { type: 3, name: 'reason', description: 'Reason' }] },
  { name: 'mute', description: 'Mute member', options: [{ type: 6, name: 'user', description: 'User', required: true }, { type: 4, name: 'minutes', description: 'Minutes', required: true }, { type: 3, name: 'reason', description: 'Reason' }] },
  { name: 'unmute', description: 'Unmute member', options: [{ type: 6, name: 'user', description: 'User', required: true }] },
  { name: 'warn', description: 'Warn member', options: [{ type: 6, name: 'user', description: 'User', required: true }, { type: 3, name: 'reason', description: 'Reason', required: true }] },
  { name: 'clear', description: 'Clear messages', options: [{ type: 4, name: 'count', description: 'Count', required: true }] },
  { name: 'rank', description: 'Show rank', options: [{ type: 6, name: 'user', description: 'User' }] },
  { name: 'leaderboard', description: 'Leaderboard' },
  { name: 'ticket', description: 'Open ticket', options: [{ type: 3, name: 'reason', description: 'Reason' }] },
  { name: 'close', description: 'Close ticket' },
  { name: 'daily', description: 'Daily reward' }, { name: 'work', description: 'Work' },
  { name: 'bal', description: 'Balance', options: [{ type: 6, name: 'user', description: 'User' }] },
  { name: 'pay', description: 'Pay user', options: [{ type: 6, name: 'user', description: 'User', required: true }, { type: 4, name: 'amount', description: 'Amount', required: true }] },
  { name: 'shop', description: 'Shop' }, { name: 'buy', description: 'Buy item', options: [{ type: 3, name: 'item', description: 'Item', required: true }] },
  { name: 'slots', description: 'Slots', options: [{ type: 4, name: 'bet', description: 'Bet', required: true }] },
  { name: 'play', description: 'Play a song', options: [{ type: 3, name: 'song', description: 'Name or URL', required: true }] },
  { name: 'skip', description: 'Skip' }, { name: 'stop', description: 'Stop' }, { name: 'queue', description: 'Queue' },
  { name: 'nowplaying', description: 'Now playing' }, { name: 'pause', description: 'Pause' }, { name: 'resume', description: 'Resume' },
  { name: 'volume', description: 'Volume', options: [{ type: 4, name: 'level', description: '1-100', required: true }] },
  { name: 'leave', description: 'Leave voice' },
];

const queues = new Map();
function getQ(g) { if (!queues.has(g)) queues.set(g, { songs: [], player: null, connection: null, current: null }); return queues.get(g); }
async function playNext(g) {
  const q = getQ(g); if (!q.songs.length) return; const s = q.songs.shift(); q.current = s;
  try { const st = await play.stream(s.url); const r = createAudioResource(st.stream, { inputType: st.type }); q.player.play(r);
    q.player.once(AudioPlayerStatus.Idle, () => playNext(g)); q.player.once('error', () => playNext(g)); } catch (e) { playNext(g); }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions] });
client.config = config;

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(config.token);
  for (const g of client.guilds.cache.values()) {
    try { await rest.put(Routes.applicationGuildCommands(config.clientId, g.id), { body: commands }); console.log(`Commands registered in ${g.name}`); } catch (e) { console.log(`Error in ${g.name}`); }
  }
  client.user.setActivity('La bubu', { type: 3 });
});

client.on('guildMemberAdd', async (member) => {
  const ch = member.guild.channels.cache.find(c => c.name === config.welcomeChannel);
  if (!ch) return;
  const e = new EmbedBuilder().setTitle('Welcome to La bubu!').setDescription(`Welcome ${member}! You are member #${member.guild.memberCount}`).setColor(0x3498DB).setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
  await ch.send({ embeds: [e] });
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const c = config.autoMod;
  if (c.badWords.find(w => msg.content.toLowerCase().includes(w))) { await msg.delete().catch(() => {}); return; }
  if (msg.content.length > 10) { const caps = (msg.content.match(/[A-Z]/g) || []).length; if (caps / msg.content.length > c.maxCaps) { await msg.delete().catch(() => {}); const w = await msg.channel.send({ content: `${msg.author} no caps` }); setTimeout(() => w.delete().catch(() => {}), 3000); return; } }
  if (msg.mentions.users.size > c.maxPings) { await msg.delete().catch(() => {}); return; }
  await addXp(msg.member);
});

client.on('voiceStateUpdate', (old, now) => {
  const m = now.member; if (!m || m.user.bot) return;
  if (!old.channelId && now.channelId) {
    const iv = setInterval(async () => { if (!m.voice?.channelId) { clearInterval(iv); return; } await handleVoiceXp(m); }, 60000);
    if (!client.vt) client.vt = new Map(); if (client.vt.has(m.id)) clearInterval(client.vt.get(m.id)); client.vt.set(m.id, iv);
  }
  if (old.channelId && !now.channelId && client.vt?.has(m.id)) { clearInterval(client.vt.get(m.id)); client.vt.delete(m.id); }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_btn') {
      const role = interaction.guild.roles.cache.find(r => r.name === config.verifiedRole);
      if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });
      await interaction.member.roles.add(role);
      return interaction.reply({ content: 'Verified! Welcome.', ephemeral: true });
    }
    return;
  }
  if (!interaction.isCommand()) return;

  const { options, member, guild, user, channel } = interaction;
  const perm = PermissionsBitField.Flags;

  if (interaction.commandName === 'setup-verify') {
    if (!memberPermissions(perm.Administrator)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_btn').setLabel('Verify').setStyle(ButtonStyle.Success));
    await channel.send({ embeds: [new EmbedBuilder().setTitle('Verification').setDescription('Click button to verify').setColor(0x2ECC71)], components: [row] });
    return interaction.reply({ content: 'Done.', ephemeral: true });
  }

  if (interaction.commandName === 'kick') {
    if (!memberPermissions(perm.KickMembers)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    const u = options.getUser('user'), r = options.getString('reason') || 'No reason';
    const m = await guild.members.fetch(u.id).catch(() => null);
    if (!m) return interaction.reply({ content: 'Not found.', ephemeral: true });
    await m.kick(r); return interaction.reply({ content: `Kicked ${u.tag}` });
  }

  if (interaction.commandName === 'ban') {
    if (!memberPermissions(perm.BanMembers)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    const u = options.getUser('user'), r = options.getString('reason') || 'No reason';
    await guild.members.ban(u, { reason: r }); return interaction.reply({ content: `Banned ${u.tag}` });
  }

  if (interaction.commandName === 'mute') {
    if (!memberPermissions(perm.ModerateMembers)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    const u = options.getUser('user'), mins = options.getInteger('minutes'), r = options.getString('reason') || '';
    const m = await guild.members.fetch(u.id); await m.timeout(mins * 60000, r);
    return interaction.reply({ content: `Muted ${u.tag} ${mins}m` });
  }

  if (interaction.commandName === 'unmute') {
    if (!memberPermissions(perm.ModerateMembers)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    const u = options.getUser('user'); const m = await guild.members.fetch(u.id); await m.timeout(null);
    return interaction.reply({ content: `Unmuted ${u.tag}` });
  }

  if (interaction.commandName === 'warn') {
    if (!memberPermissions(perm.ModerateMembers)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    const u = options.getUser('user'), r = options.getString('reason');
    const w = readJSON('warnings.json'); if (!w[u.id]) w[u.id] = [];
    w[u.id].push({ mod: user.tag, reason: r, date: new Date().toISOString() }); writeJSON('warnings.json', w);
    await interaction.reply({ content: `⚠️ ${u.tag} warned: ${r} (#${w[u.id].length})` });
    if (w[u.id].length >= config.autoMod.strikeLimit) {
      const m = await guild.members.fetch(u.id).catch(() => null);
      if (m) { await m.timeout(3600000, 'Max warnings'); await interaction.followUp({ content: `${u.tag} auto-muted.` }); }
    }
    return;
  }

  if (interaction.commandName === 'clear') {
    if (!memberPermissions(perm.ManageMessages)) return interaction.reply({ content: 'No permission.', ephemeral: true });
    await channel.bulkDelete(Math.min(options.getInteger('count'), 100), true);
    const m = await interaction.reply({ content: 'Cleared.' }); setTimeout(() => m.delete().catch(() => {}), 2000);
    return;
  }

  if (interaction.commandName === 'rank') {
    const u = options.getUser('user') || user; const l = readJSON('levels.json'); const d = l[u.id];
    if (!d) return interaction.reply({ content: `${u.tag} has no level.`, ephemeral: true });
    const sorted = Object.entries(l).sort((a, b) => (b[1].totalXp || 0) - (a[1].totalXp || 0));
    const rank = sorted.findIndex(([id]) => id === u.id) + 1;
    const e = new EmbedBuilder().setTitle(`${u.tag}`).addFields({ name: 'Level', value: `${d.level}`, inline: true }, { name: 'XP', value: `${d.xp}/${d.level*100+100}`, inline: true }, { name: 'Rank', value: `#${rank}`, inline: true }).setColor(0x3498DB);
    return interaction.reply({ embeds: [e] });
  }

  if (interaction.commandName === 'leaderboard') {
    const l = readJSON('levels.json');
    const sorted = Object.entries(l).sort((a, b) => (b[1].totalXp || 0) - (a[1].totalXp || 0)).slice(0, 10);
    if (!sorted.length) return interaction.reply({ content: 'No data.', ephemeral: true });
    let desc = '';
    for (const [id, d] of sorted) { const u = await client.users.fetch(id).catch(() => null); desc += `${sorted.indexOf([id,d])+1}. ${u?u.tag:'Unknown'} - Lvl ${d.level}\n`; }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Leaderboard').setDescription(desc).setColor(0xF1C40F)] });
  }

  if (interaction.commandName === 'ticket') {
    const reason = options.getString('reason') || 'Support';
    const t = readJSON('tickets.json');
    if (Object.values(t).find(tt => tt.user === user.id && !tt.closed)) return interaction.reply({ content: 'You already have a ticket.', ephemeral: true });
    const ch = await guild.channels.create({ name: `ticket-${user.username}`, type: ChannelType.GuildText, parent: guild.channels.cache.find(c => c.name === config.ticketCategory) || null,
      permissionOverwrites: [{ id: guild.id, deny: [perm.ViewChannel] }, { id: user.id, allow: [perm.ViewChannel, perm.SendMessages] }] });
    const role = guild.roles.cache.find(r => r.name === config.ticketRole);
    if (role) await ch.permissionOverwrites.create(role, { ViewChannel: true, SendMessages: true });
    t[ch.id] = { user: user.id, reason, closed: false, date: new Date().toISOString() }; writeJSON('tickets.json', t);
    await ch.send({ content: `<@${user.id}>`, embeds: [new EmbedBuilder().setTitle('Ticket').setDescription(`Reason: ${reason}\nUse /close`).setColor(0x9B59B6)] });
    return interaction.reply({ content: `Ticket opened: ${ch}`, ephemeral: true });
  }

  if (interaction.commandName === 'close') {
    const t = readJSON('tickets.json');
    if (!t[channel.id]) return interaction.reply({ content: 'Not a ticket.', ephemeral: true });
    t[channel.id].closed = true; writeJSON('tickets.json', t);
    await interaction.reply({ content: 'Closing in 5s...' }); setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  if (interaction.commandName === 'daily') {
    const e = readJSON('economy.json'); if (!e[user.id]) e[user.id] = { bal: 0, lastDaily: 0 };
    if (Date.now() - e[user.id].lastDaily < 86400000) return interaction.reply({ content: 'Already claimed.', ephemeral: true });
    e[user.id].bal += config.economy.dailyAmount; e[user.id].lastDaily = Date.now(); writeJSON('economy.json', e);
    return interaction.reply({ content: `Got ${config.economy.dailyAmount} coins!` });
  }

  if (interaction.commandName === 'work') {
    const e = readJSON('economy.json'); if (!e[user.id]) e[user.id] = { bal: 0, lastWork: 0 };
    if (Date.now() - e[user.id].lastWork < 3600000) return interaction.reply({ content: 'Cooldown 1h.', ephemeral: true });
    const earned = Math.floor(Math.random() * (config.economy.workMax - config.economy.workMin + 1)) + config.economy.workMin;
    e[user.id].bal += earned; e[user.id].lastWork = Date.now(); writeJSON('economy.json', e);
    return interaction.reply({ content: `Worked and got ${earned} coins!` });
  }

  if (interaction.commandName === 'bal') {
    const u = options.getUser('user') || user; const e = readJSON('economy.json');
    return interaction.reply({ content: `${u.tag} balance: **${e[u.id]?.bal || 0}**` });
  }

  if (interaction.commandName === 'pay') {
    const u = options.getUser('user'), amt = options.getInteger('amount');
    const e = readJSON('economy.json'); if (!e[user.id]) e[user.id] = { bal: 0 };
    if (e[user.id].bal < amt) return interaction.reply({ content: 'Not enough.', ephemeral: true });
    if (!e[u.id]) e[u.id] = { bal: 0 }; e[user.id].bal -= amt; e[u.id].bal += amt; writeJSON('economy.json', e);
    return interaction.reply({ content: `Paid ${amt} to ${u.tag}` });
  }

  if (interaction.commandName === 'shop') {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Shop').setDescription('`vip` - VIP role - 5000 coins\n`color` - Color role - 2000 coins').setColor(0xF1C40F)] });
  }

  if (interaction.commandName === 'buy') {
    const item = options.getString('item').toLowerCase(); const e = readJSON('economy.json');
    if (!e[user.id]) e[user.id] = { bal: 0 };
    const items = { vip: { price: 5000, role: 'VIP' }, color: { price: 2000, role: null } };
    const si = items[item]; if (!si) return interaction.reply({ content: 'Not found.', ephemeral: true });
    if (e[user.id].bal < si.price) return interaction.reply({ content: `Need ${si.price}, have ${e[user.id].bal}`, ephemeral: true });
    e[user.id].bal -= si.price; writeJSON('economy.json', e);
    if (si.role) { const r = guild.roles.cache.find(rr => rr.name === si.role); if (r) await member.roles.add(r); }
    return interaction.reply({ content: `Bought ${item} for ${si.price}!` });
  }

  if (interaction.commandName === 'slots') {
    const bet = options.getInteger('bet'); const e = readJSON('economy.json');
    if (!e[user.id]) e[user.id] = { bal: 0 }; if (e[user.id].bal < bet) return interaction.reply({ content: 'Not enough.', ephemeral: true });
    const emojis = ['🍒','🍋','🍊','🍇','💎','7️⃣']; const reels = Array(3).fill().map(() => emojis[Math.floor(Math.random()*emojis.length)]);
    const won = reels[0]===reels[1]&&reels[1]===reels[2]?bet*5:0; e[user.id].bal += won-bet; writeJSON('economy.json', e);
    return interaction.reply({ content: `${reels.join(' | ')} ${won?` Won ${won}!`:` Lost ${bet}`}` });
  }

  if (interaction.commandName === 'play') {
    const vc = member.voice.channel; if (!vc) return interaction.reply({ content: 'Join voice.', ephemeral: true });
    const q = options.getString('song'); await interaction.reply({ content: 'Searching...' });
    let sd; let search;
    try { search = await play.search(q, { limit: 1 }); if (!search.length) return interaction.editReply({ content: 'Not found.' }); sd = { title: search[0].title, url: search[0].url }; } catch { return interaction.editReply({ content: 'Error.' }); }
    const qq = getQ(guild.id); qq.songs.push(sd);
    if (!qq.connection) { qq.connection = joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator }); qq.player = createAudioPlayer(); qq.connection.subscribe(qq.player); playNext(guild.id); }
    return interaction.editReply({ content: `Added **${sd.title}**` });
  }

  if (interaction.commandName === 'skip') { const q = getQ(guild.id); if (q.player) q.player.stop(); return interaction.reply({ content: 'Skipped.' }); }
  if (interaction.commandName === 'stop') { const q = getQ(guild.id); if (q.connection) q.connection.destroy(); queues.delete(guild.id); return interaction.reply({ content: 'Stopped.' }); }
  if (interaction.commandName === 'queue') {
    const q = getQ(guild.id); if (!q.songs.length && !q.current) return interaction.reply({ content: 'Empty queue.', ephemeral: true });
    let desc = q.current ? `**Now:** ${q.current.title}\n\n` : ''; desc += q.songs.length ? q.songs.map((s,i)=>`${i+1}. ${s.title}`).join('\n') : 'Empty';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Queue').setDescription(desc).setColor(0x3498DB)] });
  }
  if (interaction.commandName === 'nowplaying') { const q = getQ(guild.id); return q.current ? interaction.reply({ content: `Now: **${q.current.title}**` }) : interaction.reply({ content: 'Nothing playing.', ephemeral: true }); }
  if (interaction.commandName === 'pause') { const q = getQ(guild.id); if (q.player) q.player.pause(); return interaction.reply({ content: 'Paused.' }); }
  if (interaction.commandName === 'resume') { const q = getQ(guild.id); if (q.player) q.player.unpause(); return interaction.reply({ content: 'Resumed.' }); }
  if (interaction.commandName === 'volume') { return interaction.reply({ content: 'Volume set.' }); }
  if (interaction.commandName === 'leave') { const q = getQ(guild.id); if (q.connection) q.connection.destroy(); queues.delete(guild.id); return interaction.reply({ content: 'Left.' }); }
});

client.login(config.token);
