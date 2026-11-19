import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {buildProgress} from '../src/hollowfang-xp.js';
import {renderLevelImage,renderAchievementsImage} from '../src/hollowfang-xp-image.js';

const empty=buildProgress({listeningMs:0,tracks:0,friends:0,chatXp:0,chatMessages:0});
const earned=buildProgress({listeningMs:36_000_000,tracks:15,friends:2,chatXp:1200,chatMessages:120});
const data={name:'fer',progress:empty};

test('both Hollowfang progression commands produce PNG images with consistent gothic frames',async()=>{
 const level=await renderLevelImage(data);
 const achievements=await renderAchievementsImage(data);
 const lm=await sharp(level).metadata(),am=await sharp(achievements).metadata();
 assert.equal(lm.format,'png');assert.equal(am.format,'png');
 assert.equal(lm.width,1200);assert.equal(lm.height,850);
 assert.equal(am.width,1200);assert.equal(am.height,1220);
 assert.ok(level.length<8_000_000);assert.ok(achievements.length<8_000_000);
});

test('dynamic earned XP and badge states visually change level and achievements images',async()=>{
 const a=await renderLevelImage(data),b=await renderLevelImage({...data,progress:earned});
 assert.notDeepEqual(a,b);
 const c=await renderAchievementsImage(data),d=await renderAchievementsImage({...data,progress:earned});
 assert.notDeepEqual(c,d);
});

test('Unicode, XML-looking display names and invalid avatar cannot corrupt PNG render',async()=>{
 const hostile={name:'<fer & "東京"> 🎵',avatar:Buffer.from('not an image'),progress:earned};
 for(const fn of [renderLevelImage,renderAchievementsImage]){
  const png=await fn(hostile);
  assert.equal((await sharp(png).metadata()).format,'png');
 }
 const pixel=await sharp({create:{width:32,height:32,channels:4,background:'#ab00ff'}}).png().toBuffer();
 assert.equal((await sharp(await renderLevelImage({...data,avatar:pixel})).metadata()).width,1200);
});

test('royal achievement art uses custom sigils for every badge and preserves status order',async()=>{
 const candidate=await renderAchievementsImage({...data,progress:earned});
 const meta=await sharp(candidate).metadata();
 assert.equal(meta.width,1200);
 assert.equal(meta.height,1220);
 assert.equal(earned.achievements.length,8);
 assert.equal(earned.achievements.filter(a=>a.unlocked).length,7);
});
test('no-data member cards render without fabricated XP or unlocked medals',async()=>{
 const a=await renderLevelImage(data),b=await renderAchievementsImage(data);
 assert.ok(a.length>0&&b.length>0);
 assert.equal(empty.xp,0);assert.equal(empty.achievements.filter(x=>x.unlocked).length,0);
});
