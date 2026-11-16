import { Routes, type Client } from 'discord.js';

/**
 * Discord Voice Channel Status (not the channel name or bot presence).
 * Keep a latest-value queue per voice channel so an old song cannot overwrite a new one.
 */
type PendingStatus = {
    desired: string | null;
    applied: string | null | undefined;
    failed: string | null | undefined;
    running?: Promise<void>;
};

export function voiceStatusText(title: string, artist?: string): string {
    const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    const song = clean(title) || 'Unknown track';
    const by = artist ? clean(artist) : '';
    const value = `🎵 ${song}${by ? ` — ${by}` : ''}`;
    return Array.from(value).slice(0, 180).join('');
}

export class VoiceStatusSync {
    private readonly pending = new Map<string, PendingStatus>();

    constructor(
        private readonly send: (channelId: string, status: string | null) => Promise<unknown>,
        private readonly warn: (message: string) => void = message => console.warn(message),
    ) {}

    static fromClient(client: Client): VoiceStatusSync {
        return new VoiceStatusSync((id, status) =>
            client.rest.put(Routes.channelVoiceStatus(id), { body: { status } }),
        );
    }

    async set(channelId: string, status: string | null): Promise<void> {
        let entry = this.pending.get(channelId);
        if (!entry) {
            entry = { desired: status, applied: undefined, failed: undefined };
            this.pending.set(channelId, entry);
        }
        entry.desired = status;
        if (!entry.running) {
            entry.running = this.flush(channelId, entry).finally(() => {
                entry.running = undefined;
            });
        }
        await entry.running;
    }

    private async flush(channelId: string, entry: PendingStatus): Promise<void> {
        while (entry.applied !== entry.desired && entry.failed !== entry.desired) {
            const status = entry.desired;
            try {
                await this.send(channelId, status);
                entry.applied = status;
                entry.failed = undefined;
            } catch (error) {
                entry.failed = status;
                const detail = error instanceof Error ? error.message : String(error);
                this.warn(`[VOICE STATUS] Gagal update channel ${channelId}: ${detail}. Periksa izin Set Voice Channel Status.`);
            }
        }
    }
}
