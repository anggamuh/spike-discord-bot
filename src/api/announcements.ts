import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ChannelType, EmbedBuilder, type Client } from 'discord.js';

const json = (status: number, body: object) => ({ status, body: JSON.stringify(body) });
const tokenMatches = (header: string | undefined, secret: string) => {
    if (!header?.startsWith('Bearer ')) return false;
    const actual = Buffer.from(header.slice(7));
    const expected = Buffer.from(secret);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export function startAnnouncementsApi(client: Client): Server {
    const secret = process.env.MANUK_API_TOKEN ?? '';
    const guildId = process.env.MANUK_MONITOR_GUILD_ID ?? '';
    const allowedChannels = new Set(
        (process.env.MANUK_ANNOUNCE_CHANNEL_IDS ?? '')
            .split(',').map(value => value.trim()).filter(Boolean)
    );
    const port = Number(process.env.MANUK_ANNOUNCE_API_PORT ?? 3211);
    if (secret.length < 32 || !/^\d{15,22}$/.test(guildId) || !allowedChannels.size) {
        throw new Error('Periksa MANUK_API_TOKEN, MANUK_MONITOR_GUILD_ID, MANUK_ANNOUNCE_CHANNEL_IDS');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port announcement tidak valid');

    const recent: number[] = [];
    const server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (status: number, body: object) => {
            const result = json(status, body);
            res.writeHead(result.status);
            res.end(result.body);
        };
        if (!tokenMatches(req.headers.authorization, secret)) return reply(401, { error: 'Unauthorized' });
        if (req.method !== 'POST' || req.url !== '/api/announcements') return reply(404, { error: 'Not Found' });
        if (!client.isReady()) return reply(503, { error: 'Bot not ready' });
        const now = Date.now();
        while (recent.length && recent[0] <= now - 60_000) recent.shift();
        if (recent.length >= 5) return reply(429, { error: 'Rate limited' });

        let raw = '';
        try {
            for await (const part of req) {
                raw += part.toString();
                if (Buffer.byteLength(raw) > 16_384) return reply(413, { error: 'Payload too large' });
            }
            const body: unknown = JSON.parse(raw);
            if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(422, { error: 'Invalid body' });
            const data = body as Record<string, unknown>;
            const channelId = data.channel_id;
            const title = data.title;
            const description = data.description;
            const content = data.content ?? '';
            const color = data.color ?? '#9b7cf7';
            const imageUrl = data.image_url ?? '';
            const imagePosition = data.image_position ?? 'bottom';
            if (typeof channelId !== 'string' || !allowedChannels.has(channelId)
                || typeof title !== 'string' || !title.trim() || title.length > 256
                || typeof description !== 'string' || !description.trim() || description.length > 4000
                || typeof content !== 'string' || content.length > 1800
                || typeof color !== 'string' || !/^#[\da-fA-F]{6}$/.test(color)
                || typeof imageUrl !== 'string' || imageUrl.length > 1800
                || (imagePosition !== 'top' && imagePosition !== 'after_title' && imagePosition !== 'bottom')) {
                return reply(422, { error: 'Validation failed' });
            }
            if (imageUrl) {
                let url: URL;
                try { url = new URL(imageUrl); } catch { return reply(422, { error: 'Invalid image URL' }); }
                if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
                    return reply(422, { error: 'Image URL must be public HTTPS' });
                }
            }
            const channel = await client.channels.fetch(channelId);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
                || channel.guildId !== guildId) return reply(403, { error: 'Channel not permitted' });
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return reply(403, { error: 'Guild unavailable' });
            const accent = parseInt(color.slice(1), 16);
            const embeds: EmbedBuilder[] = [];
            const mainText = new EmbedBuilder()
                .setTitle(title.trim())
                .setDescription(description.trim())
                .setColor(accent)
                .setFooter({ text: 'hollow.fang • ManukAPP' })
                .setTimestamp();

            if (!imageUrl || imagePosition === 'bottom') {
                // 1 embed: judul, deskripsi, lalu gambar besar.
                if (imageUrl) mainText.setImage(imageUrl);
                embeds.push(mainText);
            } else if (imagePosition === 'top') {
                // 2 embed: gambar lebih dulu, lalu judul + deskripsi.
                embeds.push(new EmbedBuilder().setColor(accent).setImage(imageUrl));
                embeds.push(mainText);
            } else {
                // 3 embed: judul saja, gambar, lalu deskripsi.
                // Discord tidak mendukung gambar di tengah title/description
                // dalam satu embed; ini pendekatan yang paling mendekati.
                embeds.push(new EmbedBuilder().setColor(accent).setTitle(title.trim()));
                embeds.push(new EmbedBuilder().setColor(accent).setImage(imageUrl));
                embeds.push(new EmbedBuilder()
                    .setColor(accent)
                    .setDescription(description.trim())
                    .setFooter({ text: 'hollow.fang • ManukAPP' })
                    .setTimestamp());
            }
            recent.push(now);
            const message = await channel.send({
                content: content.trim() || undefined,
                embeds,
                allowedMentions: { parse: [] },
            });
            return reply(200, { ok: true, message_id: message.id, channel_id: channelId });
        } catch (error) {
            // No body, authorization header, or token is logged.
            console.error('[ManukAnnouncements] Send failed:', error instanceof Error ? error.name : 'unknown');
            return reply(502, { error: 'Discord send failed' });
        }
    });
    server.listen(port, '127.0.0.1', () => console.log(`[ManukAnnouncements] API aktif di 127.0.0.1:${port}`));
    return server;
}
