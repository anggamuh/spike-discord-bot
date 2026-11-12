import { createServer, type Server } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ChannelType, PermissionFlagsBits, type Client, type GuildMember } from 'discord.js';
import { readApprovedChannels } from './announcement-directory.js';

type Audit = { id: string; at: string; action: string; actor: string; target?: string; detail?: string };
type EventItem = { id: string; title: string; description: string; channelId: string; at: string; status: 'scheduled' | 'sent' | 'failed' | 'cancelled'; messageId?: string };
type Warning = { id: string; at: string; actor: string; target: string; reason: string };
type State = { audit: Audit[]; events: EventItem[]; warnings: Warning[] };
const stateFile = resolve(process.env.MANUK_V3_DATA_FILE || './data/hollowfang-v3.json');
let state: State = { audit: [], events: [], warnings: [] };
const snowflake = (v: unknown): v is string => typeof v === 'string' && /^\d{15,22}$/.test(v);
const str = (v: unknown, max = 200): string => typeof v === 'string' ? v.trim().slice(0, max) : '';
function tokenOk(header: string | undefined, secret: string): boolean {
    if (!header?.startsWith('Bearer ')) return false;
    const a = Buffer.from(header.slice(7)); const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}
async function save(): Promise<void> {
    await mkdir(dirname(stateFile), { recursive: true });
    const temp = stateFile + '.tmp';
    await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
    // Atomic replace where supported.
    const { rename } = await import('node:fs/promises');
    await rename(temp, stateFile);
}
function log(action: string, actor: string, target = '', detail = ''): void {
    state.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), action, actor, target, detail });
    state.audit = state.audit.slice(0, 500);
}
function memberRow(m: GuildMember) {
    return { id: m.id, username: m.user.username, displayName: m.displayName,
        bot: m.user.bot, joinedAt: m.joinedAt?.toISOString() ?? null,
        roleIds: m.roles.cache.filter(r => r.id !== m.guild.id).map(r => r.id) };
}
export async function startControlV3Api(client: Client): Promise<Server> {
    const secret = process.env.MANUK_API_TOKEN ?? '';
    const guildId = process.env.MANUK_MONITOR_GUILD_ID ?? '';
    const port = Number(process.env.MANUK_V3_API_PORT ?? 3212);
    if (secret.length < 32 || !snowflake(guildId) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('V3: MANUK_API_TOKEN, MANUK_MONITOR_GUILD_ID, MANUK_V3_API_PORT invalid');
    }
    try {
        const parsed: unknown = JSON.parse(await readFile(stateFile, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const x = parsed as Partial<State>;
            state = { audit: Array.isArray(x.audit) ? x.audit.slice(0, 500) : [], events: Array.isArray(x.events) ? x.events : [], warnings: Array.isArray(x.warnings) ? x.warnings.slice(0, 500) : [] };
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    let busy = false;
    async function dispatchEvents(): Promise<void> {
        if (busy || !client.isReady()) return;
        busy = true;
        try {
            const guild = await client.guilds.fetch(guildId);
            for (const e of state.events.filter(e => e.status === 'scheduled' && Date.parse(e.at) <= Date.now()).slice(0, 10)) {
                try {
                    if (!readApprovedChannels(guildId).has(e.channelId)) throw new Error('Channel no longer approved');
                    const ch = await guild.channels.fetch(e.channelId);
                    if (!ch || (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement)) throw new Error('Invalid channel');
                    const message = await ch.send({ content: `## ${e.title}\n${e.description}`, allowedMentions: { parse: [] } });
                    e.status = 'sent'; e.messageId = message.id;
                    log('event.sent', 'scheduler', e.id, e.title);
                } catch { e.status = 'failed'; log('event.failed', 'scheduler', e.id, e.title); }
                await save();
            }
        } catch { /* Bot offline, retry on next tick */ } finally { busy = false; }
    }
    const ticker = setInterval(() => { void dispatchEvents(); }, 30_000);
    ticker.unref();
    const server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (code: number, obj: object) => { res.writeHead(code); res.end(JSON.stringify(obj)); };
        if (!tokenOk(req.headers.authorization, secret)) return reply(401, { error: 'Unauthorized' });
        if (!client.isReady()) return reply(503, { error: 'Bot offline' });
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const method = req.method || 'GET';
        if (!url.pathname.startsWith('/api/v3/')) return reply(404, { error: 'Not found' });
        try {
            const guild = await client.guilds.fetch(guildId);
            const me = await guild.members.fetchMe();
            if (method === 'GET' && url.pathname === '/api/v3/overview') {
                return reply(200, { guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
                    bot: { pingMs: client.ws.ping, uptimeSeconds: Math.floor(process.uptime()) },
                    permissions: { moderate: me.permissions.has(PermissionFlagsBits.ModerateMembers),
                        kick: me.permissions.has(PermissionFlagsBits.KickMembers), ban: me.permissions.has(PermissionFlagsBits.BanMembers),
                        roles: me.permissions.has(PermissionFlagsBits.ManageRoles) },
                    events: { scheduled: state.events.filter(e => e.status === 'scheduled').length },
                    auditCount: state.audit.length, warningCount: state.warnings.length, timestamp: new Date().toISOString() });
            }
            if (method === 'GET' && url.pathname === '/api/v3/members') {
                const query = str(url.searchParams.get('q'), 64).toLowerCase();
                const requestedLimit = Number(url.searchParams.get('limit') || 50);
                const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 50;
                // Cached members only: no privileged GuildMembers intent needed. Coverage may be incomplete.
                const candidate = snowflake(query) ? await guild.members.fetch(query).catch(() => null) : null;
                const pool = new Map(guild.members.cache);
                if (candidate) pool.set(candidate.id, candidate);
                const members = [...pool.values()].filter(m => !query || m.user.username.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query) || m.id === query).slice(0, limit).map(memberRow);
                return reply(200, { members, partial: true, cachedCount: guild.members.cache.size, guildCount: guild.memberCount });
            }
            if (method === 'GET' && url.pathname === '/api/v3/logs') return reply(200, { logs: state.audit.slice(0, 100) });
            if (method === 'GET' && url.pathname === '/api/v3/warnings') return reply(200, { warnings: state.warnings.slice(0, 100) });
            if (method === 'GET' && url.pathname === '/api/v3/roles') return reply(200, { roles: guild.roles.cache.filter(r => r.id !== guild.id).map(r => ({ id: r.id, name: r.name, managed: r.managed, position: r.position })) });
            if (method === 'GET' && url.pathname === '/api/v3/events') return reply(200, { events: state.events.slice(0, 100) });
            if (method !== 'POST') return reply(404, { error: 'Not found' });
            let raw = ''; for await (const part of req) { raw += part.toString(); if (Buffer.byteLength(raw) > 8192) return reply(413, { error: 'Payload too large' }); }
            let body: Record<string, unknown>;
            try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(); body = parsed as Record<string, unknown>; }
            catch { return reply(422, { error: 'Invalid JSON' }); }
            const actor = str(body.actor, 100);
            if (!snowflake(actor)) return reply(422, { error: 'Valid actor Discord ID required' });
            const actorMember = await guild.members.fetch(actor).catch(() => null);
            if (!actorMember || (actor !== guild.ownerId && !actorMember.permissions.has(PermissionFlagsBits.Administrator))) {
                return reply(403, { error: 'Actor must be guild admin' });
            }
            // Admin authorization applies to ALL mutating V3 endpoints, not only moderation.
            const canActOn = (member: GuildMember): boolean =>
                actor === guild.ownerId || actorMember.roles.highest.comparePositionTo(member.roles.highest) > 0;

            if (url.pathname === '/api/v3/moderate') {
                const target = body.targetId; const action = body.action; const reason = str(body.reason, 300);
                if (!snowflake(target) || !['timeout', 'untimeout', 'kick', 'ban'].includes(String(action)) || reason.length < 3) return reply(422, { error: 'Invalid moderation request' });
                if (actor === target || target === client.user?.id || target === guild.ownerId) return reply(403, { error: 'Protected account' });
                // Discord permission and role hierarchy enforcement; do not elevate bot.
                const targetMember = await guild.members.fetch(target).catch(() => null);
                if (targetMember && actor !== guild.ownerId && !canActOn(targetMember)) return reply(403, { error: 'Target rank is not below actor' });
                if (targetMember && !targetMember.moderatable && ['timeout', 'untimeout'].includes(String(action))) return reply(403, { error: 'Target not moderatable' });
                if (targetMember && !targetMember.kickable && action === 'kick') return reply(403, { error: 'Target not kickable' });
                if (action === 'ban' && !me.permissions.has(PermissionFlagsBits.BanMembers)) return reply(403, { error: 'Bot lacks Ban Members permission' });
                if (targetMember && !targetMember.bannable && action === 'ban') return reply(403, { error: 'Target not bannable' });
                if (action === 'timeout' || action === 'untimeout') {
                    if (!targetMember) return reply(404, { error: 'Member not found' });
                    const minutes = Number(body.minutes);
                    if (action === 'timeout' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320)) return reply(422, { error: 'Minutes 1–40320 required' });
                    await targetMember.timeout(action === 'untimeout' ? null : minutes * 60_000, reason);
                } else if (action === 'kick') {
                    if (!targetMember) return reply(404, { error: 'Member not found' });
                    await targetMember.kick(reason);
                } else if (action === 'ban') {
                    await guild.members.ban(target, { reason, deleteMessageSeconds: 0 });
                }
                log(`moderation.${action}`, actor, target, reason); await save();
                return reply(200, { ok: true });
            }
            if (url.pathname === '/api/v3/warn') {
                const target = body.targetId; const reason = str(body.reason, 300);
                if (!snowflake(target) || reason.length < 3 || actor === target || target === guild.ownerId) return reply(422, { error: 'Invalid warning' });
                const member = await guild.members.fetch(target).catch(() => null);
                if (!member || member.id === client.user?.id || !canActOn(member)) return reply(403, { error: 'Member unavailable or insufficient hierarchy' });
                state.warnings.unshift({ id: randomUUID(), at: new Date().toISOString(), actor, target, reason });
                state.warnings = state.warnings.slice(0, 500);
                log('moderation.warn', actor, target, reason);
                await save();
                return reply(200, { ok: true, count: state.warnings.filter(w => w.target === target).length });
            }
            if (url.pathname === '/api/v3/role') {
                const target = body.targetId; const roleId = body.roleId; const operation = body.operation;
                if (!snowflake(target) || !snowflake(roleId) || !['add', 'remove'].includes(String(operation))) return reply(422, { error: 'Invalid role request' });
                const member = await guild.members.fetch(target).catch(() => null);
                const role = await guild.roles.fetch(roleId).catch(() => null);
                if (!member || !role || role.managed || role.id === guild.id || member.id === guild.ownerId || !canActOn(member) || !me.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable || (actor !== guild.ownerId && actorMember.roles.highest.comparePositionTo(role) <= 0)) {
                    return reply(403, { error: 'Role or hierarchy not permitted' });
                }
                if (operation === 'add') await member.roles.add(role, 'Hollowfang V3 dashboard');
                else await member.roles.remove(role, 'Hollowfang V3 dashboard');
                log(`role.${operation}`, actor, target, role.id);
                await save();
                return reply(200, { ok: true });
            }
            if (url.pathname === '/api/v3/events/cancel') {
                const id = str(body.id, 100);
                const event = state.events.find(e => e.id === id);
                if (!event || event.status !== 'scheduled') return reply(409, { error: 'Event cannot be cancelled' });
                event.status = 'cancelled';
                log('event.cancelled', actor, event.id, event.title);
                await save();
                return reply(200, { ok: true });
            }
            if (url.pathname === '/api/v3/events') {
                const title = str(body.title, 100); const description = str(body.description, 1000);
                const channelId = body.channelId; const at = str(body.at, 40);
                if (!title || !snowflake(channelId) || !at || !Number.isFinite(Date.parse(at)) || Date.parse(at) <= Date.now()) return reply(422, { error: 'Invalid event' });
                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) || !readApprovedChannels(guildId).has(channelId)) return reply(403, { error: 'Channel is not in announcement allowlist' });
                if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return reply(403, { error: 'Bot cannot send messages in channel' });
                const event: EventItem = { id: randomUUID(), title, description, channelId, at: new Date(at).toISOString(), status: 'scheduled' };
                state.events.unshift(event); state.events = state.events.slice(0, 200);
                log('event.created', actor, event.id, title); await save();
                return reply(200, { ok: true, event });
            }
            return reply(404, { error: 'Not found' });
        } catch (err) {
            console.error('[HollowfangV3]', err instanceof Error ? err.name : 'Unknown');
            return reply(502, { error: 'Discord API operation failed' });
        }
    });
    server.on('close', () => clearInterval(ticker));
    server.listen(port, '127.0.0.1', () => console.log(`[HollowfangV3] 127.0.0.1:${port}`));
    return server;
}
