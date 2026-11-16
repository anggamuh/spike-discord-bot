import assert from 'node:assert/strict';
import test from 'node:test';
import { VoiceStatusSync, voiceStatusText } from '../src/voice-status.js';

test('voice status sanitizes title and includes artist', () => {
    assert.equal(voiceStatusText('Test\nSong', 'The Band'), '🎵 Test Song — The Band');
    assert.ok(Array.from(voiceStatusText('x'.repeat(1000))).length <= 180);
});

test('voice status only writes when title actually changes', async () => {
    const updates: Array<string | null> = [];
    const sync = new VoiceStatusSync(async (_, status) => { updates.push(status); });
    await sync.set('123', '🎵 First');
    await sync.set('123', '🎵 First');
    await sync.set('123', '🎵 Second');
    await sync.set('123', null);
    assert.deepEqual(updates, ['🎵 First', '🎵 Second', null]);
});

test('newest title wins when a previous Discord request is still pending', async () => {
    const updates: Array<string | null> = [];
    let finish!: () => void;
    const firstPending = new Promise<void>(resolve => { finish = resolve; });
    const sync = new VoiceStatusSync(async (_, status) => {
        updates.push(status);
        if (status === '🎵 First') await firstPending;
    });
    const first = sync.set('123', '🎵 First');
    const second = sync.set('123', '🎵 Second');
    finish();
    await Promise.all([first, second]);
    assert.deepEqual(updates, ['🎵 First', '🎵 Second']);
});

test('Discord permission errors do not throw into music playback', async () => {
    const warnings: string[] = [];
    const sync = new VoiceStatusSync(async (_, status) => {
        if (status === '🎵 First') throw new Error('Missing Permissions');
    }, message => warnings.push(message));
    await sync.set('123', '🎵 First');
    await sync.set('123', '🎵 First');
    assert.equal(warnings.length, 1);
    await sync.set('123', '🎵 Second');
});
