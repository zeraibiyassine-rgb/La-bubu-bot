const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  verifiedRole: process.env.VERIFIED_ROLE || 'Member',
  welcomeChannel: process.env.WELCOME_CHANNEL || '👋-ترحيب',
  modLogChannel: process.env.MOD_LOG_CHANNEL || '🔒-سجلات-الإدارة',
  ticketCategory: process.env.TICKET_CATEGORY || '🎫-التذاكر',
  ticketRole: process.env.TICKET_ROLE || 'Support Team',
  autoMod: { badWords: ['spam'], maxCaps: 0.7, maxPings: 5, maxLines: 10, strikeLimit: 3 },
  levels: { messageXp: 15, voiceXpPerMinute: 20, xpCooldown: 60 },
  economy: { dailyAmount: 500, workMin: 50, workMax: 200 },
  music: { maxQueueSize: 100, defaultVolume: 50 }
};

try {
  const fileConfig = require('./config.json');
  Object.assign(config, fileConfig);
} catch (e) {}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
  ]
});

client.commands = new Collection();
client.config = config;

const commands = [
  { name: 'setup-verify', description: 'إعداد نظام التأكيد' },
  { name: 'verify', description: 'تأكيد العضوية' },
  { name: 'kick', description: 'طرد عضو', options: [{ type: 6, name: 'user', description: 'العضو', required: true }, { type: 3, name: 'reason', description: 'السبب', required: false }] },
  { name: 'ban', description: 'حظر عضو', options: [{ type: 6, name: 'user', description: 'العضو', required: true }, { type: 3, name: 'reason', description: 'السبب', required: false }] },
  { name: 'unban', description: 'إلغاء حظر', options: [{ type: 3, name: 'userid', description: 'آي دي', required: true }] },
  { name: 'mute', description: 'كتم عضو', options: [{ type: 6, name: 'user', description: 'العضو', required: true }, { type: 4, name: 'minutes', description: 'الدقائق', required: true }, { type: 3, name: 'reason', description: 'السبب', required: false }] },
  { name: 'unmute', description: 'إلغاء الكتم', options: [{ type: 6, name: 'user', description: 'العضو', required: true }] },
  { name: 'warn', description: 'تحذير عضو', options: [{ type: 6, name: 'user', description: 'العضو', required: true }, { type: 3, name: 'reason', description: 'السبب', required: true }] },
  { name: 'warnings', description: 'عرض التحذيرات', options: [{ type: 6, name: 'user', description: 'العضو', required: true }] },
  { name: 'clear', description: 'مسح رسائل', options: [{ type: 4, name: 'count', description: 'العدد', required: true }] },
  { name: 'rank', description: 'مستواك', options: [{ type: 6, name: 'user', description: 'العضو', required: false }] },
  { name: 'leaderboard', description: 'المتصدرين' },
  { name: 'ticket', description: 'فتح تذكرة', options: [{ type: 3, name: 'reason', description: 'السبب', required: false }] },
  { name: 'close', description: 'إغلاق التذكرة' },
  { name: 'daily', description: 'المكافأة اليومية' },
  { name: 'bal', description: 'الرصيد', options: [{ type: 6, name: 'user', description: 'العضو', required: false }] },
  { name: 'pay', description: 'تحويل', options: [{ type: 6, name: 'user', description: 'المستلم', required: true }, { type: 4, name: 'amount', description: 'المبلغ', required: true }] },
  { name: 'work', description: 'اشتغل' },
  { name: 'shop', description: 'المتجر' },
  { name: 'buy', description: 'شراء', options: [{ type: 3, name: 'item', description: 'القطعة', required: true }] },
  { name: 'slots', description: 'سلوتس', options: [{ type: 4, name: 'bet', description: 'المبلغ', required: true }] },
  { name: 'play', description: 'شغل أغنية', options: [{ type: 3, name: 'song', description: 'اسم أو رابط', required: true }] },
  { name: 'skip', description: 'تخطي' },
  { name: 'stop', description: 'إيقاف' },
  { name: 'queue', description: 'القائمة' },
  { name: 'nowplaying', description: 'الحالي' },
  { name: 'pause', description: 'إيقاف مؤقت' },
  { name: 'resume', description: 'استمرار' },
  { name: 'volume', description: 'الصوت', options: [{ type: 4, name: 'level', description: '1-100', required: true }] },
  { name: 'leave', description: 'طرد البوت' },
];

client.once('ready', async () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
  console.log('📋 السيرفرات المسجل فيها:');
  client.guilds.cache.forEach(g => console.log(`  - ${g.name} (ID: ${g.id})`));

  // Register guild commands فورياً
  const rest = new REST({ version: '10' }).setToken(config.token);
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guild.id), { body: commands });
      console.log(`✅ تم تسجيل الأوامر في: ${guild.name}`);
    } catch (err) {
      console.log(`⚠️ خطأ في ${guild.name}: ${err.message}`);
    }
  }
  client.user.setActivity('La bubu', { type: 3 });
});

const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

client.login(config.token);
