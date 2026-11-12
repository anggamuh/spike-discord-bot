import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { handleDirectoryRequest, readApprovedChannels } from './announcement-directory.js';
import {
    ChannelType,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    TextDisplayBuilder,
    type Client,
} from 'discord.js';

type ImagePosition = 'top' | 'after_title' | 'bottom';

const validPositions: ImagePosition[] = ['top', 'after_title', 'bottom'];

const tokenMatches = (header: string | undefined, secret: string): boolean => {
    if (!header?.startsWith('Bearer ')) return false;
    const actual = Buffer.from(header.slice(7));
    const expected = Buffer.from(secret);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const validImageUrl = (url: string): boolean => {
    if (!url) return true;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:'
            && Boolean(parsed.hostname)
            && !parsed.username
            && !parsed.password;
    } catch {
        return false;
    }
};

export function startAnnouncementsApi(client: Client): Server {
    const secret = process.env.MANUK_API_TOKEN ?? '';
    const guildId = process.env.MANUK_MONITOR_GUILD_ID ?? '';
    
    const port = Number(process.env.MANUK_ANNOUNCE_API_PORT ?? 3211);

    if (secret.length < 32 || !/^\d{15,22}$/.test(guildId)) {
        throw new Error('Periksa MANUK_API_TOKEN, MANUK_MONITOR_GUILD_ID, MANUK_ANNOUNCE_CHANNEL_IDS');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Port announcement tidak valid');
    }

    const recent: number[] = [];
    const server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (status: number, body: object) => {
            res.writeHead(status);
            res.end(JSON.stringify(body));
        };

        if (!tokenMatches(req.headers.authorization, secret)) {
            return reply(401, { error: 'Unauthorized' });
        }
        if (await handleDirectoryRequest(req, client, guildId, reply)) return;
        if (req.method !== 'POST' || req.url !== '/api/announcements') {
            return reply(404, { error: 'Not Found' });
        }
        if (!client.isReady()) {
            return reply(503, { error: 'Bot not ready' });
        }
        const now = Date.now();
        while (recent.length && recent[0] <= now - 60_000) recent.shift();
        if (recent.length >= 5) {
            return reply(429, { error: 'Rate limited' });
        }

        try {
            let raw = '';
            for await (const part of req) {
                raw += part.toString();
                if (Buffer.byteLength(raw) > 16_384) {
                    return reply(413, { error: 'Payload too large' });
                }
            }

            const body: unknown = JSON.parse(raw);
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                return reply(422, { error: 'Invalid body' });
            }
            const data = body as Record<string, unknown>;
            const channelId = data.channel_id;
            const title = data.title;
            const description = data.description;
            const content = data.content ?? '';
            const color = data.color ?? '#9b7cf7';
            const imageUrl = data.image_url ?? '';
            const imagePosition = data.image_position ?? 'top';
            const imageUrl2 = data.image_url_2 ?? '';
            const imagePosition2 = data.image_position_2 ?? 'bottom';

            if (
                typeof channelId !== 'string' || !readApprovedChannels(guildId).has(channelId) ||
                typeof title !== 'string' || !title.trim() || title.length > 256 ||
                typeof description !== 'string' || !description.trim() || description.length > 4000 ||
                typeof content !== 'string' || content.length > 1800 ||
                typeof color !== 'string' || !/^#[\da-fA-F]{6}$/.test(color) ||
                typeof imageUrl !== 'string' || imageUrl.length > 1800 ||
                typeof imageUrl2 !== 'string' || imageUrl2.length > 1800 ||
                typeof imagePosition !== 'string' || !validPositions.includes(imagePosition as ImagePosition) ||
                typeof imagePosition2 !== 'string' || !validPositions.includes(imagePosition2 as ImagePosition)
            ) {
                return reply(422, { error: 'Validation failed' });
            }
            if (!validImageUrl(imageUrl) || !validImageUrl(imageUrl2)) {
                return reply(422, { error: 'Images must use public HTTPS URLs' });
            }

            const footer = '-# hollow.fang • ManukAPP';
            const cleanContent = content.trim();
            const headingText = `## ${title.trim()}`;
            const cleanDescription = description.trim();
            if (cleanContent.length + headingText.length + cleanDescription.length + footer.length > 4000) {
                return reply(422, { error: 'Total text exceeds 4000 characters' });
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel ||
                (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) ||
                channel.guildId !== guildId || !client.guilds.cache.has(guildId)) {
                return reply(403, { error: 'Channel not permitted' });
            }

            // Satu container. Dua gambar adalah dua Media Gallery pada lokasi masing-masing,
            // BUKAN dua gambar dalam satu gallery berjajar dan BUKAN beberapa embed.
            const card = new ContainerBuilder();
            const images: { url: string; position: ImagePosition; label: string }[] = [
                { url: imageUrl, position: imagePosition as ImagePosition, label: 'Gambar 1' },
                { url: imageUrl2, position: imagePosition2 as ImagePosition, label: 'Gambar 2' },
            ];
            const addImages = (position: ImagePosition): void => {
                for (const image of images) {
                    if (!image.url || image.position !== position) continue;
                    card.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder()
                                .setURL(image.url)
                                .setDescription(`Hollowfang ${image.label}`)
                        )
                    );
                }
            };
            const addText = (value: string): void => {
                card.addTextDisplayComponents(new TextDisplayBuilder().setContent(value));
            };

            if (cleanContent) addText(cleanContent);
            addImages('top');
            addText(headingText);
            addImages('after_title');
            addText(cleanDescription);
            addImages('bottom');
            addText(footer);

            // Flag Components V2: tidak boleh mencampur content/embeds biasa.
            recent.push(now);
            const message = await channel.send({
                flags: MessageFlags.IsComponentsV2,
                components: [card],
                allowedMentions: { parse: [] },
            });
            console.log(`[ManukAnnouncements] Pesan terkirim ke channel ${channelId}`);
            return reply(200, { ok: true, message_id: message.id, channel_id: channelId });
        } catch (error) {
            // Jangan log token, header Authorization, atau isi pengumuman.
            console.error('[ManukAnnouncements] Send failed:', error instanceof Error ? error.name : 'unknown');
            return reply(502, { error: 'Discord send failed' });
        }
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(`[ManukAnnouncements] API aktif di 127.0.0.1:${port}`);
    });
    return server;
}
