import {mkdir,writeFile} from 'node:fs/promises';
import {buildProgress} from '../src/hollowfang-xp.js';
import {renderLevelImage,renderAchievementsImage} from '../src/hollowfang-xp-image.js';

const progress=buildProgress({listeningMs:74_760_000,tracks:26,friends:3,chatXp:0,chatMessages:0});
const demo={name:'Hollowfang Member',progress};
await mkdir('artifacts/hollowfang-preview',{recursive:true});
await Promise.all([
 writeFile('artifacts/hollowfang-preview/level-demo.png',await renderLevelImage(demo)),
 writeFile('artifacts/hollowfang-preview/achievements-demo.png',await renderAchievementsImage(demo))
]);
console.log('Hollowfang preview PNGs created; example member and XP are DEMO only.');
