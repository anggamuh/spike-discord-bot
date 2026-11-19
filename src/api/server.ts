import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { PermissionFlagsBits, type Client } from 'discord.js';
import type { Music } from '../music.js';

function validToken(
    authorization: string | undefined,
    secret: string
): boolean {
    if (!authorization?.startsWith('Bearer ')) {
        return false;
    }

    const supplied = Buffer.from(authorization.slice(7));
    const expected = Buffer.from(secret);

    return supplied.length === expected.length
        && timingSafeEqual(supplied, expected);
}

export function startMonitoringApi(client: Client, music?: Music): Server {
    const token = process.env.MANUK_API_TOKEN;

    if (!token || token.length < 32) {
        throw new Error(
            'MANUK_API_TOKEN wajib diisi minimal 32 karakter.'
        );
    }

    // A separate monitoring target does not change the bot's command registration guild.
    const guildId = process.env.MANUK_MONITOR_GUILD_ID
        || process.env.DISCORD_GUILD_ID;
    const port = Number(process.env.MANUK_API_PORT || 3210);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('MANUK_API_PORT tidak valid.');
    }

    const recentActions = new Map<string, number[]>();
    const allowedActions = new Set(['pause', 'resume', 'skip', 'shuffle', 'autoplay_on', 'autoplay_off', 'loop_off', 'loop_song', 'loop_queue']);

    const server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');

        if (!validToken(req.headers.authorization, token)) {
            res.writeHead(401);
            res.end(JSON.stringify({
                error: 'Unauthorized'
            }));
            return;
        }

        if (req.method === 'POST' && req.url === '/api/music/control') {
            const reply = (status: number, value: object) => {
                res.writeHead(status);
                res.end(JSON.stringify(value));
            };
            if (!client.isReady() || !guildId || !music) {
                return reply(503, { error: 'Music controller unavailable' });
            }
            let body = '';
            try {
                for await (const part of req) {
                    body += part.toString();
                    if (Buffer.byteLength(body) > 2048) return reply(413, { error: 'Payload too large' });
                }
                const data: unknown = JSON.parse(body);
                if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(422, { error: 'Invalid request' });
                const payload = data as Record<string, unknown>;
                const actor = payload.actor;
                const action = payload.action;
                if (typeof actor !== 'string' || !/^\d{15,22}$/.test(actor) ||
                    typeof action !== 'string' || !allowedActions.has(action)) {
                    return reply(422, { error: 'Invalid actor or action' });
                }
                const guild = await client.guilds.fetch(guildId);
                const member = await guild.members.fetch(actor).catch(() => null);
                if (!member || (actor !== guild.ownerId &&
                    !member.permissions.has(PermissionFlagsBits.Administrator))) {
                    return reply(403, { error: 'Only guild administrators can control playback' });
                }
                const now = Date.now();
                const timestamps = (recentActions.get(actor) ?? []).filter(at => now - at < 60_000);
                if (timestamps.length >= 10) return reply(429, { error: 'Too many music actions' });
                timestamps.push(now);
                recentActions.set(actor, timestamps);
                const result = await music.dashboardControl(guildId, action as Parameters<Music['dashboardControl']>[1]);
                return reply(result.ok ? 200 : 409, result);
            } catch {
                return reply(502, { error: 'Music control failed' });
            }
        }

        if (req.method !== 'GET' || req.url !== '/api/health') {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not Found' }));
            return;
        }

        const ready = client.isReady();

        const guild = ready && guildId
            ? client.guilds.cache.get(guildId)
            : undefined;

        const lavalink = music?.lavalinkSnapshot() ?? {
            connected: null,
            status: 'Music Disabled'
        };
        const musicState = music?.monitoringSnapshot(guildId) ?? {
            active_sessions: null,
            queue_length: null,
            queue: [],
            paused: null,
            voice_channel_id: null,
            now_playing: null
        };

        const payload = {
            bot: {
                name: client.user?.username ?? 'ManukAPP',
                connected: ready,
                uptime_seconds: Math.floor(process.uptime()),
                ping_ms: ready && client.ws.ping >= 0
                    ? client.ws.ping
                    : null
            },
            discord: {
                connected: ready,
                guild_id: guild?.id ?? guildId ?? null,
                guild_name: guild?.name ?? null,
                total_members: guild?.memberCount ?? null,
                online_members: null
            },
            lavalink,
            music: musicState,
            timestamp: new Date().toISOString()
        };

        res.writeHead(200);
        res.end(JSON.stringify(payload));
    });

    // Hanya menerima koneksi dari PC sendiri.
    server.listen(port, '127.0.0.1', () => {
        console.log(
            `[ManukAPI] Monitoring aktif di 127.0.0.1:${port}`
        );
    });

    server.on('error', (error) => {
        console.error('[ManukAPI] Server error:', error);
    });

    return server;
}
