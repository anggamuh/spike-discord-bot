import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgress} from '../src/hollowfang-xp.js';
import {levelCard,achievementsCard,xpTopCard} from '../src/hollowfang-xp-ui.js';

const beginner=buildProgress({listeningMs:0,tracks:0,friends:0,chatXp:0,chatMessages:0});
const veteran=buildProgress({listeningMs:36_000_000,tracks:14,friends:2,chatXp:1200,chatMessages:120});
const serialized=(card:{toJSON:()=>unknown})=>JSON.stringify(card.toJSON());

test('level card shows truthful XP, rank, music and chat breakdown with a progress bar',()=>{
 const card=serialized(levelCard('fer',veteran,'https://cdn.discordapp.com/embed/avatars/0.png'));
 assert.match(card,/H O L L O W F A N G/);
 assert.match(card,/LEVEL 5/);
 assert.match(card,/DUSK WALKER/);
 assert.ok(card.includes('1.800 XP'));
 assert.ok(card.includes('1.200 XP'));
 assert.match(card,/600 XP/);
 assert.match(card,/▰/);
 assert.match(card,/EARNED HONORS/);
 assert.doesNotMatch(card,/MANUK MUSIC/);
});

test('achievement card groups unlocked and locked rewards without claiming missing achievements',()=>{
 const card=serialized(achievementsCard('fer',beginner));
 assert.ok(card.includes('0 / 8 HONORS CLAIMED'));
 assert.match(card,/YET TO BE DISCOVERED/);
 assert.ok(!card.includes('✦  **FIRST ECHO**'));
 const withProgress=serialized(achievementsCard('fer',veteran));
 assert.match(withProgress,/UNLOCKED RELICS/);
 assert.match(withProgress,/MUSIC ADDICT/);
 assert.match(withProgress,/FIRST WHISPER/);
 assert.match(withProgress,/YET TO BE DISCOVERED/);
 assert.match(withProgress,/HOLLOW ELITE/);
});

test('leaderboard handles empty and normal rows, and escapes untrusted Discord names',()=>{
 assert.match(serialized(xpTopCard([])),/No XP recorded yet/);
 const card=serialized(xpTopCard([{name:'*evil* @everyone',xp:1246},{name:'fer',xp:80}]));
 assert.ok(card.includes('1.246 XP'));
 assert.ok(card.includes('evil'));
 assert.match(card,/THE HOLLOW ELITE/);
});
