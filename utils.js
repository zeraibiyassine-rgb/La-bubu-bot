const fs = require('fs');
const path = require('path');
let config = { levels: { messageXp: 15, voiceXpPerMinute: 20, xpCooldown: 60 }, welcomeChannel: '👋-ترحيب' };
try { const fc = require('./config.json'); Object.assign(config, fc); } catch (e) {}

const dataPath = (file) => path.join(__dirname, 'data', file);

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(dataPath(file), 'utf8')); }
  catch { return {}; }
}
function writeJSON(file, data) {
  fs.writeFileSync(dataPath(file), JSON.stringify(data, null, 2));
}

const xpCooldowns = new Set();

async function addXp(member) {
  if (xpCooldowns.has(member.id)) return;
  const levels = readJSON('levels.json');
  if (!levels[member.id]) levels[member.id] = { level: 1, xp: 0, totalXp: 0 };
  const data = levels[member.id];
  data.xp += config.levels.messageXp;
  data.totalXp += config.levels.messageXp;
  const needed = data.level * 100 + 100;
  if (data.xp >= needed) {
    data.level += 1;
    data.xp = 0;
    const channel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannel);
    if (channel) channel.send({ content: `🎉 ${member} وصل للمستوى **${data.level}**` });
  }
  writeJSON('levels.json', levels);
  xpCooldowns.add(member.id);
  setTimeout(() => xpCooldowns.delete(member.id), config.levels.xpCooldown * 1000);
}

async function handleVoiceXp(member) {
  const levels = readJSON('levels.json');
  if (!levels[member.id]) levels[member.id] = { level: 1, xp: 0, totalXp: 0 };
  const data = levels[member.id];
  data.xp += config.levels.voiceXpPerMinute;
  data.totalXp += config.levels.voiceXpPerMinute;
  const needed = data.level * 100 + 100;
  if (data.xp >= needed) {
    data.level += 1;
    data.xp = 0;
    const channel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannel);
    if (channel) channel.send({ content: `🎉 ${member} وصل للمستوى **${data.level}**` });
  }
  writeJSON('levels.json', levels);
}

module.exports = { addXp, handleVoiceXp, readJSON, writeJSON };
