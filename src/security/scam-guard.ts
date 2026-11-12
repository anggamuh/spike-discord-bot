import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Events, PermissionFlagsBits, type Client, type Message, type TextChannel } from 'discord.js';

/** Anti-scam signals, not an image OCR/classifier. Never assume a flagged post is fraud. */
export type ScamSignal = 'promo-language' | 'suspicious-url' | 'mass-mention' | 'image-burst' | 'repeat-post';
export type ScamInput = {
  content: string; attachmentCount: number; mentionCount: number;
  recentSimilar: number; recentAttachments: number;
};
export type ScanResult = { score: number; signals: ScamSignal[] };
const suspiciousDomains = /(?:discord(?:-gift|gift|nitro|app)[-.]|(?:free|claim|bonus|prize|reward)[-.].*(?:gift|crypto|nitro))|(?:bit\.ly|tinyurl\.com)\//i;
const promoWords = /\b(?:mr\s?beast|kai\s?cenat|giveaway|withdraw(?:al)?|claim\s?(?:your|the)?\s?(?:prize|reward)|free\s?(?:money|crypto|nitro)|\$\s?\d{3,})\b/i;
const financialClaims = /\b(?:crypto|usdt|bitcoin|wallet|withdraw(?:al)?|prize|claim|giveaway|cash(?:app)?|payment)\b/i;

export function scoreScam(input: ScamInput): ScanResult {
  const signals: ScamSignal[] = [];
  let score = 0;
  const content = input.content.slice(0, 4000);
  const links = content.match(/https?:\/\/\S+|(?:discord\.gg|discord\.com\/invite)\/\S+/gi) ?? [];
  const suspiciousLink = links.some(link => suspiciousDomains.test(link) || /discord\.gg\//i.test(link));
  if (suspiciousLink) { score += 3; signals.push('suspicious-url'); }
  if (promoWords.test(content) && (financialClaims.test(content) || input.attachmentCount > 0)) {
    score += 2; signals.push('promo-language');
  }
  if (input.mentionCount >= 5) { score += 2; signals.push('mass-mention'); }
  if (input.attachmentCount >= 2 && (input.recentAttachments >= 4 || input.recentSimilar >= 1)) {
    score += 2; signals.push('image-burst');
  }
  if (input.recentSimilar >= 2) { score += 3; signals.push('repeat-post'); }
  return { score, signals };
}

type Recent = { at: number; signature: string; attachments: number };
export function startScamGuard(client: Client): () => void {
  const guildId = process.env.MANUK_MONITOR_GUILD_ID || '';
  const mode = (process.env.HF_SCAM_GUARD_MODE || 'off').toLowerCase();
  if (!['off', 'log', 'delete'].includes(mode)) throw new Error('HF_SCAM_GUARD_MODE must be off, log or delete');
  if (mode === 'off') { console.log('[ScamGuard] off'); return () => {}; }
  const threshold = Math.max(3, Math.min(10, Number(process.env.HF_SCAM_GUARD_THRESHOLD || 5) || 5));
  const logChannelId = process.env.HF_SCAM_LOG_CHANNEL_ID || '';
  const excludedChannels = new Set((process.env.HF_SCAM_EXEMPT_CHANNEL_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
  const excludedRoles = new Set((process.env.HF_SCAM_EXEMPT_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
  const logFile = resolve(process.env.HF_SCAM_LOG_FILE || './data/hollowfang-scam-guard.jsonl');
  const byUser = new Map<string, Recent[]>();
  const lastAlert = new Map<string, number>();
  let writes: Promise<void> = Promise.resolve();
  let cleanupAt = 0;
  const onMessage = async (message: Message): Promise<void> => {
    if (!message.inGuild() || message.guildId !== guildId || message.author.bot || message.webhookId) return;
    if (excludedChannels.has(message.channelId)) return;
    const member = message.member;
    if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages) || member.roles.cache.some(r => excludedRoles.has(r.id))) return;
    const now = Date.now();
    if (now > cleanupAt) {
      cleanupAt = now + 60_000;
      for (const [key, events] of byUser) {
        const recent = events.filter(x => now - x.at < 45_000);
        if (recent.length) byUser.set(key, recent); else byUser.delete(key);
      }
      for (const [key, at] of lastAlert) if (now - at > 120_000) lastAlert.delete(key);
    }
    const key = message.author.id;
    const recent = (byUser.get(key) ?? []).filter(x => now - x.at < 30_000);
    const attachments = [...message.attachments.values()].filter(a => a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '')).length;
    const signature = `${message.content.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200)}|${attachments}`;
    const same = signature.length > 2 ? recent.filter(x => x.signature === signature).length : 0;
    const mentions = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
    const finding = scoreScam({
      content: message.content, attachmentCount: attachments, mentionCount: mentions,
      recentSimilar: same, recentAttachments: recent.reduce((n, x) => n + x.attachments, 0) + attachments,
    });
    recent.push({ at: now, signature, attachments });
    byUser.set(key, recent.slice(-25));
    if (finding.score < threshold || lastAlert.get(key) && now - lastAlert.get(key)! < 20_000) return;
    lastAlert.set(key, now);
    let action = 'flagged';
    if (mode === 'delete' && message.deletable) {
      try { await message.delete(); action = 'deleted'; }
      catch { action = 'delete_failed'; }
    }
    const event = {
      at: new Date(now).toISOString(), guildId, channelId: message.channelId,
      messageId: message.id, userId: message.author.id,
      score: finding.score, signals: finding.signals, action,
    };
    // No message body, attachment URLs, or credentials stored in local log.
    writes = writes.catch(() => {}).then(async () => {
      await mkdir(dirname(logFile), { recursive: true });
      await appendFile(logFile, JSON.stringify(event) + '\n', 'utf8');
    });
    await writes.catch(err => console.error('[ScamGuard] Log write failed:', err instanceof Error ? err.name : 'unknown'));
    console.log(`[ScamGuard] ${action} ${event.userId} score=${event.score} signals=${event.signals.join(',')}`);
    if (/^\d{15,22}$/.test(logChannelId) && logChannelId !== message.channelId) {
      const channel = await message.guild.channels.fetch(logChannelId).catch(() => null);
      if (channel?.isTextBased() && 'send' in channel) {
        await (channel as TextChannel).send({
          content: `🛡️ **Scam Guard** · ${action} · skor ${finding.score}\nMember: <@${message.author.id}> · Channel: <#${message.channelId}>\nSinyal: ${finding.signals.join(', ')}\nPesan: ${message.id}\n*Periksa secara manual sebelum memberikan hukuman.*`,
          allowedMentions: { parse: [] },
        }).catch(() => console.warn('[ScamGuard] Cannot send staff log'));
      }
    }
  };
  client.on(Events.MessageCreate, onMessage);
  console.log(`[ScamGuard] mode=${mode} threshold=${threshold} guild=${guildId}`);
  return () => client.off(Events.MessageCreate, onMessage);
}
