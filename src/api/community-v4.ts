import { createServer, type Server } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Events,
  GatewayIntentBits, PermissionFlagsBits, type Client, type GuildMember,
  type Message, type Interaction, type PartialGuildMember,
} from 'discord.js';

// Community extension for the EXISTING ManukAPP client. Off unless configured.
type Config = {
  welcomeEnabled: boolean; welcomeChannelId: string; welcomeText: string;
  welcomeImageUrl: string; welcomeRulesChannelId: string; welcomeInfoChannelId: string;
  welcomeHeader: string; welcomeTitle: string; welcomeThumbnailUrl: string;
  goodbyeEnabled: boolean; goodbyeChannelId: string; goodbyeText: string;
  autoModEnabled: boolean; spamLimit: number; spamWindowSeconds: number;
  blockedWords: string[]; blockLinks: boolean; exemptRoleIds: string[];
  ticketCategoryId: string; ticketSupportRoleId: string;
  selfRoles: string[];
};
type Ticket = { id: string; channelId: string; userId: string; createdAt: string; status: 'open' | 'claimed' | 'closed'; claimedBy?: string; claimedAt?: string; closedBy?: string; closedAt?: string; transcriptFile?: string; transcriptCount?: number };
type Activity = { at: string; action: string; actor: string; detail: string };
type State = { config: Config; tickets: Ticket[]; activity: Activity[] };
const defaults: Config = {
  welcomeEnabled: false, welcomeChannelId: '', welcomeText: 'Selamat datang di {server}, {user}!\n\nBaca panduan server sebelum menjelajah.\n\n*Di balik kegelapan, setiap jiwa punya tempat.*',
  welcomeImageUrl: '', welcomeRulesChannelId: '', welcomeInfoChannelId: '',
  welcomeHeader: 'wsg, {user}!', welcomeTitle: 'welcome to {user} !!', welcomeThumbnailUrl: '',
  goodbyeEnabled: false, goodbyeChannelId: '', goodbyeText: '{username} telah meninggalkan {server}.',
  autoModEnabled: false, spamLimit: 6, spamWindowSeconds: 10,
  blockedWords: [], blockLinks: false, exemptRoleIds: [],
  ticketCategoryId: '', ticketSupportRoleId: '', selfRoles: [],
};
const idValid = (x: unknown): x is string => typeof x === 'string' && /^\d{15,22}$/.test(x);
const restrictedSelfRole = (role: { permissions: { any: (flags: bigint[], checkAdmin?: boolean) => boolean } }) => role.permissions.any([
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
], false);
const clean = (x: unknown, limit = 500) => typeof x === 'string' ? x.trim().slice(0, limit) : '';
const disk = resolve(process.env.MANUK_COMMUNITY_DATA_FILE || './data/hollowfang-community.json');
function safeToken(header: string | undefined, token: string) {
  if (!header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7)); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function row(customId: string, label: string, style: ButtonStyle = ButtonStyle.Primary) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style)
  );
}

export async function startCommunityV4(client: Client): Promise<Server> {
  const token = process.env.MANUK_API_TOKEN ?? '';
  const guildId = process.env.MANUK_MONITOR_GUILD_ID ?? '';
  const port = Number(process.env.MANUK_COMMUNITY_API_PORT || 3213);
  if (token.length < 32 || !idValid(guildId) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('V4 requires MANUK_API_TOKEN, MANUK_MONITOR_GUILD_ID, valid port');
  let state: State = { config: { ...defaults }, tickets: [], activity: [] };
  try {
    const data: unknown = JSON.parse(await readFile(disk, 'utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const s = data as Partial<State>;
      state = {
        config: { ...defaults, ...(s.config || {}) },
        tickets: Array.isArray(s.tickets) ? s.tickets.slice(-500) : [],
        activity: Array.isArray(s.activity) ? s.activity.slice(0, 300) : [],
      };
    }
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  let writeQueue: Promise<void> = Promise.resolve();
  function save() {
    const snapshot = JSON.stringify(state, null, 2);
    writeQueue = writeQueue.catch(() => { }).then(async () => {
      await mkdir(dirname(disk), { recursive: true });
      const tmp = `${disk}.${randomUUID()}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, disk);
    });
    return writeQueue;
  }
  function record(action: string, actor: string, detail = '') {
    state.activity.unshift({ at: new Date().toISOString(), action, actor, detail: detail.slice(0, 200) });
    state.activity = state.activity.slice(0, 300);
  }
  const guild = await client.guilds.fetch(guildId);
  const textChannel = async (id: string) => {
    if (!idValid(id)) return null;
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) return null;
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
    return channel;
  };
  const windows = new Map<string, number[]>();
  const creating = new Set<string>();
  const closing = new Set<string>();
  const ticketStore = resolve(process.env.MANUK_TICKET_TRANSCRIPT_DIR || './data/ticket-transcripts');
  const transcriptName = (id: string) => `${id}.txt`;
  async function captureTranscript(ticket: Ticket): Promise<{ filename: string; count: number }> {
    const channel = await guild.channels.fetch(ticket.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel tiket tidak dapat diakses');
    const me = await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]))
      throw new Error('Izin membaca riwayat pesan tidak tersedia');
    const all: Message[] = [];
    let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) break;
      all.push(...batch.values());
      before = batch.last()?.id;
      if (batch.size < 100 || !before) break;
    }
    all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = [
      'HOLLOWFANG TICKET TRANSCRIPT',
      `Ticket: ${ticket.id}`,
      `Channel: ${ticket.channelId}`,
      `Member: ${ticket.userId}`,
      `Claimed by: ${ticket.claimedBy || '-'}`,
      `Captured: ${new Date().toISOString()}`,
      `Messages captured: ${all.length} (maksimal 1000 pesan terakhir)`,
      '===================================',
      ...all.map(m => {
        const attachments = [...m.attachments.values()].map(a => a.url).join(' | ');
        return `[${m.createdAt.toISOString()}] ${m.author.username} (${m.author.id}): ${m.content || '[tanpa teks]'}${attachments ? `\nAttachments: ${attachments}` : ''}`;
      })
    ];
    await mkdir(ticketStore, { recursive: true });
    const filename = transcriptName(ticket.id);
    const tmp = resolve(ticketStore, `${filename}.${randomUUID()}.tmp`);
    await writeFile(tmp, lines.join('\n') + '\n', 'utf8');
    await rename(tmp, resolve(ticketStore, filename));
    return { filename, count: all.length };
  }

  // Welcome layout: header outside embed, mention in bold description,
  // channel links above tagline, then the main image and member footer.
  // Discord embed titles do not render mention links, so a title containing
  // {user} is placed as the first (bold) description line instead.
  const renderWelcome = (member: GuildMember, isTest = false) => {
    const c = state.config;
    const rules = idValid(c.welcomeRulesChannelId) ? `<#${c.welcomeRulesChannelId}>` : '#rules';
    const info = idValid(c.welcomeInfoChannelId) ? `<#${c.welcomeInfoChannelId}>` : '#info';

    // Live welcome uses an actual Discord mention. In the non-pinging test,
    // show the display name so the preview never shows an empty "@" label.
    const userLabel = isTest ? `@${member.displayName}` : `<@${member.id}>`;
    const render = (value: string) => value
      .replaceAll('{user}', userLabel)
      .replaceAll('{username}', member.user.username)
      .replaceAll('{server}', member.guild.name)
      .replaceAll('{count}', String(member.guild.memberCount))
      .replaceAll('{rules}', rules)
      .replaceAll('{info}', info);

    const titleTemplate = c.welcomeTitle || 'welcome to {user} !!';
    const titleHasMention = titleTemplate.includes('{user}');
    const safeTitle = render(titleTemplate).replaceAll('**', '').trim();
    const rulesLine = `✧ | dont forget to read ${rules} & ${info}`;
    const welcomeMessage = render(c.welcomeText).trim();
    const description = [
      ...(titleHasMention ? [`**${safeTitle}**`] : []),
      rulesLine,
      welcomeMessage,
    ].filter(Boolean).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x5d516f)
      .setDescription(description.slice(0, 4096))
      .setThumbnail(c.welcomeThumbnailUrl || member.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `hollow.fang • Jiwa ke-${member.guild.memberCount}` });

    if (!titleHasMention) embed.setTitle(safeTitle.slice(0, 256));
    if (c.welcomeImageUrl) embed.setImage(c.welcomeImageUrl);

    const header = render(c.welcomeHeader || 'wsg, {user}!').slice(0, 1900);
    return {
      content: isTest ? `✦ Preview (tanpa ping)\n${header}` : header,
      embeds: [embed],
      // Actual join only notifies the joining member; preview never pings.
      allowedMentions: { parse: [] as const, users: isTest ? [] : [member.id] },
    };
  };
  const onJoin = async (member: GuildMember) => {
    if (member.guild.id !== guildId || !state.config.welcomeEnabled) return;
    const channel = await textChannel(state.config.welcomeChannelId);
    if (!channel) { console.warn('[CommunityV4] Welcome channel unavailable'); return; }
    try {
      await channel.send(renderWelcome(member));
      record('welcome.sent', member.id, channel.id);
      await save();
    } catch (e) {
      console.error('[CommunityV4] Welcome failed:', e instanceof Error ? e.message : 'Unknown');
    }
  };
  const onLeave = async (member: GuildMember | PartialGuildMember) => {
    if (member.guild.id !== guildId || !state.config.goodbyeEnabled) return;
    const channel = await textChannel(state.config.goodbyeChannelId);
    if (!channel) return;
    await channel.send({ content: state.config.goodbyeText.replaceAll('{username}', member.user.username).replaceAll('{server}', member.guild.name), allowedMentions: { parse: [] } }).catch(() => { });
  };
  const onMessage = async (msg: Message) => {
    if (!msg.inGuild() || msg.guildId !== guildId || msg.author.bot || !state.config.autoModEnabled) return;
    const member = msg.member;
    if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.roles.cache.some(r => state.config.exemptRoleIds.includes(r.id))) return;
    const content = msg.content.toLocaleLowerCase();
    const blocked = state.config.blockedWords.some(word => word && new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(content));
    const links = state.config.blockLinks && /https?:\/\/|discord\.gg\//i.test(content);
    const key = `${msg.guildId}:${msg.author.id}`;
    const now = Date.now();
    const timestamps = (windows.get(key) || []).filter(t => now - t < state.config.spamWindowSeconds * 1000);
    timestamps.push(now); windows.set(key, timestamps);
    const spam = timestamps.length >= state.config.spamLimit;
    if (!(blocked || links || spam)) return;
    if (!msg.deletable) return;
    try {
      await msg.delete();
      record('automod.delete', msg.author.id, blocked ? 'blocked word' : links ? 'link' : 'spam');
      await save();
    } catch { /* lacking permission; do not fake success */ }
  };
  const onInteraction = async (i: Interaction) => {
    if (!i.isButton() || !i.inGuild() || i.guildId !== guildId || !(i.customId.startsWith('hf4:') || i.customId.startsWith('hf41:'))) return;
    try {
      if (i.customId === 'hf4:ticket:open') {
        await i.deferReply({ ephemeral: true });
        if (creating.has(i.user.id)) { await i.editReply('Permintaan tiket sedang diproses.'); return; }
        creating.add(i.user.id);
        try {
          const existing = state.tickets.find(t => t.status !== 'closed' && t.userId === i.user.id);
          if (existing) {
            const live = await guild.channels.fetch(existing.channelId).catch(() => null);
            if (live) { await i.editReply(`Kamu sudah punya tiket: <#${existing.channelId}>`); return; }
            existing.status = 'closed'; record('ticket.orphan', i.user.id, existing.channelId); await save();
          }
          const me = await guild.members.fetchMe();
          if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) { await i.editReply('Bot belum punya izin Manage Channels.'); return; }
          const opts = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
          ];
          if (idValid(state.config.ticketSupportRoleId)) {
            const support = await guild.roles.fetch(state.config.ticketSupportRoleId).catch(() => null);
            if (!support) { await i.editReply('Role staff ticket belum valid.'); return; }
            opts.push({ id: support.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
          }
          const category = idValid(state.config.ticketCategoryId) ? await guild.channels.fetch(state.config.ticketCategoryId).catch(() => null) : null;
          const channel = await guild.channels.create({
            name: `ticket-${i.user.id.slice(-6)}`, type: ChannelType.GuildText,
            parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
            permissionOverwrites: opts,
          });
          const ticket: Ticket = { id: randomUUID(), channelId: channel.id, userId: i.user.id, createdAt: new Date().toISOString(), status: 'open' };
          state.tickets.push(ticket); record('ticket.open', i.user.id, channel.id); await save();
          await channel.send({
            content: `## ✦ HOLLOWFANG SUPPORT\nTiket milik <@${i.user.id}>. Jelaskan kebutuhanmu. Staff bisa klaim untuk menanganinya.`,
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId('hf4:ticket:claim').setLabel('Klaim Ticket').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('hf4:ticket:close').setLabel('Tutup Ticket').setStyle(ButtonStyle.Danger),
            )], allowedMentions: { parse: [] },
          });
          await i.editReply(`Tiket berhasil dibuat: <#${channel.id}>`);
        } finally { creating.delete(i.user.id); }
        return;
      }
      if (i.customId === 'hf4:ticket:claim') {
        await i.deferReply({ ephemeral: true });
        const ticket = state.tickets.find(t => t.status !== 'closed' && t.channelId === i.channelId);
        if (!ticket) { await i.editReply('Ticket tidak ditemukan.'); return; }
        const member = await guild.members.fetch(i.user.id);
        const isStaff = i.user.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageChannels) || (idValid(state.config.ticketSupportRoleId) && member.roles.cache.has(state.config.ticketSupportRoleId));
        if (!isStaff) { await i.editReply('Hanya staff yang boleh klaim ticket.'); return; }
        if (ticket.status === 'claimed') { await i.editReply(`Ticket sudah diklaim oleh <@${ticket.claimedBy}>.`); return; }
        ticket.status = 'claimed'; ticket.claimedBy = i.user.id; ticket.claimedAt = new Date().toISOString();
        record('ticket.claim', i.user.id, ticket.channelId); await save();
        const ticketChannel = await guild.channels.fetch(ticket.channelId).catch(() => null);
        if (ticketChannel?.type === ChannelType.GuildText) await ticketChannel.send({ content: `✦ Ticket diklaim oleh <@${i.user.id}>.`, allowedMentions: { parse: [] } });
        await i.editReply('Ticket berhasil diklaim.');
        return;
      }
      if (i.customId === 'hf4:ticket:close') {
        await i.deferReply({ ephemeral: true });
        const ticket = state.tickets.find(t => t.status !== 'closed' && t.channelId === i.channelId);
        if (!ticket) { await i.editReply('Ticket tidak ditemukan.'); return; }
        const m = await guild.members.fetch(i.user.id);
        if (ticket.userId !== i.user.id && i.user.id !== guild.ownerId && !m.permissions.has(PermissionFlagsBits.ManageChannels) && !m.roles.cache.has(state.config.ticketSupportRoleId)) {
          await i.editReply('Tidak diizinkan menutup tiket.'); return;
        }
        await i.editReply({ content: 'Konfirmasi tutup tiket? Transcript akan disimpan sebelum channel dihapus.', components: [row(`hf41:ticket:confirm:${ticket.id}`, 'Ya, Tutup & Arsipkan', ButtonStyle.Danger)] });
        return;
      }
      if (i.customId.startsWith('hf41:ticket:confirm:')) {
        await i.deferReply({ ephemeral: true });
        const ticketId = i.customId.slice('hf41:ticket:confirm:'.length);
        const ticket = state.tickets.find(t => t.id === ticketId && t.status !== 'closed' && t.channelId === i.channelId);
        if (!ticket) { await i.editReply('Ticket sudah ditutup atau tidak ditemukan.'); return; }
        const m = await guild.members.fetch(i.user.id);
        if (ticket.userId !== i.user.id && i.user.id !== guild.ownerId && !m.permissions.has(PermissionFlagsBits.ManageChannels) && !m.roles.cache.has(state.config.ticketSupportRoleId)) {
          await i.editReply('Tidak diizinkan.'); return;
        }
        if (closing.has(ticketId)) { await i.editReply('Ticket sedang ditutup.'); return; }
        closing.add(ticketId);
        try {
          const archive = await captureTranscript(ticket);
          const channel = await guild.channels.fetch(ticket.channelId);
          if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel ticket hilang');
          await channel.delete(`Hollowfang ticket closed by ${i.user.id}`);
          ticket.status = 'closed'; ticket.closedBy = i.user.id; ticket.closedAt = new Date().toISOString();
          ticket.transcriptFile = archive.filename; ticket.transcriptCount = archive.count;
          record('ticket.close', i.user.id, ticket.channelId); await save();
          await i.editReply('Ticket ditutup. Transcript tersimpan dan bisa diunduh Owner melalui dashboard.');
        } catch {
          await i.editReply('Gagal menyimpan transcript atau menghapus channel. Tiket tidak ditandai tertutup; periksa izin bot dan ruang penyimpanan.');
        } finally { closing.delete(ticketId); }
        return;
      }
      if (i.customId.startsWith('hf4:role:')) {
        await i.deferReply({ ephemeral: true });
        const roleId = i.customId.slice('hf4:role:'.length);
        if (!idValid(roleId) || !state.config.selfRoles.includes(roleId)) { await i.editReply('Role ini tidak lagi tersedia.'); return; }
        const member = await guild.members.fetch(i.user.id);
        const role = await guild.roles.fetch(roleId);
        if (!role || role.managed || !role.editable || restrictedSelfRole(role)) { await i.editReply('Role tidak boleh dibagikan lewat self-role.'); return; }
        const remove = member.roles.cache.has(roleId);
        if (remove) await member.roles.remove(role); else await member.roles.add(role);
        record(remove ? 'selfrole.remove' : 'selfrole.add', i.user.id, roleId); await save();
        await i.editReply(remove ? `Role ${role.name} dilepas.` : `Role ${role.name} diberikan.`);
      }
    } catch (e) {
      if (i.deferred || i.replied) await i.editReply('Operasi gagal. Cek permission bot dan hierarki role.').catch(() => { });
      else await i.reply({ content: 'Operasi gagal.', ephemeral: true }).catch(() => { });
    }
  };
  client.on(Events.GuildMemberAdd, onJoin);
  client.on(Events.GuildMemberRemove, onLeave);
  client.on(Events.MessageCreate, onMessage);
  client.on(Events.InteractionCreate, onInteraction);
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const reply = (code: number, value: object) => { res.writeHead(code); res.end(JSON.stringify(value)); };
    if (!safeToken(req.headers.authorization, token)) return reply(401, { error: 'Unauthorized' });
    if (!client.isReady()) return reply(503, { error: 'Bot offline' });
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/v4/')) return reply(404, { error: 'Not found' });
    if (req.method === 'GET' && url.pathname === '/api/v4/ticket-transcript') {
      const id = url.searchParams.get('id') || '';
      const ticket = state.tickets.find(t => t.id === id && t.status === 'closed' && t.transcriptFile === transcriptName(id));
      if (!ticket || !/^[a-f0-9-]{36}$/.test(id)) return reply(404, { error: 'Transcript not found' });
      try {
        const content = await readFile(resolve(ticketStore, ticket.transcriptFile!), 'utf8');
        if (Buffer.byteLength(content) > 2_000_000) return reply(413, { error: 'Transcript too large' });
        return reply(200, { filename: `hollowfang-ticket-${id}.txt`, content });
      } catch { return reply(404, { error: 'Transcript file unavailable' }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/v4/status') return reply(200, {
      config: state.config, activity: state.activity.slice(0, 50), tickets: state.tickets.slice(-50).reverse(),
      capabilities: {
        welcome: client.options.intents.has(GatewayIntentBits.GuildMembers),
        automod: client.options.intents.has(GatewayIntentBits.GuildMessages) && client.options.intents.has(GatewayIntentBits.MessageContent)
      },
    });
    if (req.method !== 'POST') return reply(404, { error: 'Not found' });
    let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 16_384) return reply(413, { error: 'Too large' }); }
    let body: Record<string, unknown>;
    try { const x: unknown = JSON.parse(raw); if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error(); body = x as Record<string, unknown>; }
    catch { return reply(422, { error: 'Invalid JSON' }); }
    const actor = body.actor;
    if (!idValid(actor)) return reply(422, { error: 'Actor required' });
    const admin = await guild.members.fetch(actor).catch(() => null);
    if (!admin || (actor !== guild.ownerId && !admin.permissions.has(PermissionFlagsBits.Administrator))) return reply(403, { error: 'Guild admin required' });
    try {
      if (url.pathname === '/api/v4/settings') {
        const c = body.config;
        if (!c || typeof c !== 'object' || Array.isArray(c)) return reply(422, { error: 'Config required' });
        const x = c as Record<string, unknown>;
        const welcomeEnabled = x.welcomeEnabled === true, goodbyeEnabled = x.goodbyeEnabled === true, autoModEnabled = x.autoModEnabled === true;
        const welcomeChannelId = clean(x.welcomeChannelId, 25), goodbyeChannelId = clean(x.goodbyeChannelId, 25);
        const welcomeImageUrl = clean(x.welcomeImageUrl, 1800);
        const welcomeThumbnailUrl = clean(x.welcomeThumbnailUrl ?? state.config.welcomeThumbnailUrl, 1800);
        const welcomeHeader = clean(x.welcomeHeader ?? state.config.welcomeHeader, 500);
        const welcomeTitle = clean(x.welcomeTitle ?? state.config.welcomeTitle, 256);
        const welcomeRulesChannelId = clean(x.welcomeRulesChannelId, 25), welcomeInfoChannelId = clean(x.welcomeInfoChannelId, 25);
        if ([welcomeImageUrl, welcomeThumbnailUrl].some(value => {
          if (!value) return false;
          try { const u = new URL(value); return u.protocol !== 'https:' || !u.hostname || !!u.username || !!u.password; }
          catch { return true; }
        })) return reply(422, { error: 'Welcome images must use HTTPS URLs' });
        if (!welcomeHeader || !welcomeTitle) return reply(422, { error: 'Welcome header and title are required' });
        if ((welcomeRulesChannelId && !await textChannel(welcomeRulesChannelId)) || (welcomeInfoChannelId && !await textChannel(welcomeInfoChannelId))) return reply(422, { error: 'Rules/info channel invalid or inaccessible' });
        if ((welcomeEnabled && !await textChannel(welcomeChannelId)) || (goodbyeEnabled && !await textChannel(goodbyeChannelId))) return reply(422, { error: 'Welcome/goodbye channel invalid or inaccessible' });
        if ((welcomeEnabled || goodbyeEnabled) && !client.options.intents.has(GatewayIntentBits.GuildMembers)) return reply(422, { error: 'GuildMembers intent required' });
        if (autoModEnabled && !(client.options.intents.has(GatewayIntentBits.GuildMessages) && client.options.intents.has(GatewayIntentBits.MessageContent))) return reply(422, { error: 'GuildMessages and MessageContent intents required' });
        const spamLimit = Number(x.spamLimit), spamWindowSeconds = Number(x.spamWindowSeconds);
        if (!Number.isInteger(spamLimit) || spamLimit < 3 || spamLimit > 30 || !Number.isInteger(spamWindowSeconds) || spamWindowSeconds < 3 || spamWindowSeconds > 120) return reply(422, { error: 'Spam threshold invalid' });
        const blockedWords = Array.isArray(x.blockedWords) ? x.blockedWords.map(s => clean(s, 40).toLowerCase()).filter(Boolean).slice(0, 50) : [];
        const exemptRoleIds = Array.isArray(x.exemptRoleIds) ? x.exemptRoleIds.filter(idValid).slice(0, 30) : [];
        if (clean(x.welcomeText, 1000).length < 1 || clean(x.goodbyeText, 1000).length < 1) return reply(422, { error: 'Template cannot be empty' });
        state.config = {
          ...state.config, welcomeEnabled, goodbyeEnabled, autoModEnabled,
          welcomeChannelId, goodbyeChannelId, welcomeText: clean(x.welcomeText, 1000), goodbyeText: clean(x.goodbyeText, 1000),
          welcomeImageUrl, welcomeRulesChannelId, welcomeInfoChannelId, welcomeHeader, welcomeTitle, welcomeThumbnailUrl,
          spamLimit, spamWindowSeconds, blockedWords, blockLinks: x.blockLinks === true, exemptRoleIds,
          ticketCategoryId: clean(x.ticketCategoryId, 25), ticketSupportRoleId: clean(x.ticketSupportRoleId, 25), selfRoles: state.config.selfRoles
        };
        record('settings.update', actor); await save(); return reply(200, { ok: true });
      }
      if (url.pathname === '/api/v4/test-welcome') {
        if (!client.options.intents.has(GatewayIntentBits.GuildMembers)) return reply(422, { error: 'GuildMembers intent required' });
        const channel = await textChannel(state.config.welcomeChannelId);
        if (!channel) return reply(422, { error: 'Welcome channel not set or inaccessible' });
        const member = await guild.members.fetch(actor).catch(() => null);
        if (!member) return reply(404, { error: 'Testing member not found' });
        const message = await channel.send(renderWelcome(member, true));
        record('welcome.test', actor, message.id); await save();
        return reply(200, { ok: true, messageId: message.id });
      }
      if (url.pathname === '/api/v4/publish-ticket') {
        const channel = await textChannel(clean(body.channelId, 25));
        if (!channel) return reply(422, { error: 'Channel invalid or inaccessible' });
        const message = await channel.send({ content: '## ✦ HOLLOWFANG SUPPORT\nButuh bantuan? Tekan tombol di bawah untuk membuka tiket pribadi.', components: [row('hf4:ticket:open', 'Buka Tiket')], allowedMentions: { parse: [] } });
        record('ticket.panel', actor, message.id); await save(); return reply(200, { ok: true, messageId: message.id });
      }
      if (url.pathname === '/api/v4/publish-role') {
        const channel = await textChannel(clean(body.channelId, 25));
        const roleId = body.roleId;
        const role = idValid(roleId) ? await guild.roles.fetch(roleId).catch(() => null) : null;
        if (!channel || !role || role.managed || !role.editable || role.id === guildId || restrictedSelfRole(role)) return reply(422, { error: 'Role cannot be self-assigned (permissions/hierarchy)' });
        if (!state.config.selfRoles.includes(role.id)) state.config.selfRoles.push(role.id);
        const message = await channel.send({ content: `## ✦ PILIH ROLE\nKlik tombol untuk memasang atau melepas role **${role.name.replaceAll('@', '＠')}**.`, components: [row(`hf4:role:${role.id}`, `Toggle ${role.name.slice(0, 50)}`)], allowedMentions: { parse: [] } });
        record('selfrole.panel', actor, message.id); await save(); return reply(200, { ok: true, messageId: message.id });
      }
      return reply(404, { error: 'Not found' });
    } catch (e) { console.error('[CommunityV4]', e instanceof Error ? e.name : 'Unknown'); return reply(502, { error: 'Discord operation failed' }); }
  });
  server.on('close', () => {
    client.off(Events.GuildMemberAdd, onJoin); client.off(Events.GuildMemberRemove, onLeave);
    client.off(Events.MessageCreate, onMessage); client.off(Events.InteractionCreate, onInteraction);
  });
  server.listen(port, '127.0.0.1', () => console.log(`[CommunityV4] 127.0.0.1:${port}`));
  return server;
}
