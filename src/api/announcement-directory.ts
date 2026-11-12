import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { ChannelType, PermissionFlagsBits, type Client } from 'discord.js';
import type { IncomingMessage } from 'node:http';

const validId = (id: unknown): id is string => typeof id === 'string' && /^\d{15,22}$/.test(id);
const filePath = (guildId: string) => join(process.cwd(), 'data', `announcement-channels-${guildId}.json`);

// The existing .env allowlist is used only as an initial seed.
// Once the Owner changes permissions in the dashboard, the JSON file is authoritative.
export function readApprovedChannels(guildId: string): Set<string> {
    const path = filePath(guildId);
    if (!existsSync(path)) {
        return new Set((process.env.MANUK_ANNOUNCE_CHANNEL_IDS ?? '')
            .split(',').map(s => s.trim()).filter(validId));
    }
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter(validId));
    } catch (error) {
        // Fail closed when configuration is unreadable.
        console.error('[ManukDirectory] Cannot read allowlist:', error instanceof Error ? error.name : 'unknown');
        return new Set();
    }
}

function saveApprovedChannels(guildId: string, ids: string[]): void {
    const path = filePath(guildId);
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    const tempPath = `${path}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(ids, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tempPath, path);
}

type Reply = (status: number, body: object) => void;

export async function handleDirectoryRequest(
    req: IncomingMessage,
    client: Client,
    guildId: string,
    reply: Reply,
): Promise<boolean> {
    if (req.url !== '/api/announcements/directory' &&
        req.url !== '/api/announcements/channels') return false;

    if (!client.isReady()) { reply(503, { error: 'Bot not ready' }); return true; }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) { reply(503, { error: 'Guild not available' }); return true; }

    try {
        const channels = [...(await guild.channels.fetch()).values()].filter(
            c => c !== null &&
                (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
        );

        if (req.url === '/api/announcements/directory' && req.method === 'GET') {
            const approved = readApprovedChannels(guildId);
            const roles = await guild.roles.fetch();
            reply(200, {
                guild_id: guildId,
                channels: channels
                    .sort((a, b) => (a?.rawPosition ?? 0) - (b?.rawPosition ?? 0))
                    .map(c => ({ id: c!.id, name: c!.name, allowed: approved.has(c!.id) })),
                roles: [...roles.values()]
                    .filter(r => r.id !== guildId && !r.managed)
                    .sort((a, b) => b.position - a.position)
                    .map(r => ({ id: r.id, name: r.name })),
            });
            return true;
        }

        if (req.url === '/api/announcements/channels' && req.method === 'PUT') {
            let raw = '';
            for await (const chunk of req) {
                raw += chunk.toString();
                if (Buffer.byteLength(raw) > 8192) { reply(413, { error: 'Too large' }); return true; }
            }
            let body: unknown;
            try { body = JSON.parse(raw); } catch { reply(422, { error: 'Invalid JSON' }); return true; }
            const ids = (body as { channel_ids?: unknown } | null)?.channel_ids;
            if (!Array.isArray(ids) || ids.length > 100 || ids.some(x => !validId(x))) {
                reply(422, { error: 'Invalid channel list' }); return true;
            }
            const unique = [...new Set(ids as string[])];
            const me = await guild.members.fetchMe();
            for (const id of unique) {
                const c = channels.find(channel => channel?.id === id);
                if (!c || !c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                    reply(422, { error: 'Channel inaccessible to ManukAPP' }); return true;
                }
            }
            saveApprovedChannels(guildId, unique);
            reply(200, { ok: true, channel_ids: unique });
            return true;
        }
        reply(405, { error: 'Method not allowed' });
    } catch (error) {
        console.error('[ManukDirectory] Error:', error instanceof Error ? error.name : 'unknown');
        reply(502, { error: 'Directory unavailable' });
    }
    return true;
}
