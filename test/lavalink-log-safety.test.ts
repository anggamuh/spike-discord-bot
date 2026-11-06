import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeLavalinkLine} from '../scripts/lavalink-log-safety.mjs';

test('Lavalink output redacts credentials, device codes and signed stream URLs',()=>{
 const raw='refreshToken=refresh-secret access_token=access-secret user_code=ABCD-EFGH Authorization: Bearer bearer-secret https://rr2.googlevideo.com/videoplayback?sig=signed-value';
 const safe=sanitizeLavalinkLine(raw,['refresh-secret','access-secret','bearer-secret','cipher-secret']);
 assert.doesNotMatch(safe,/refresh-secret|access-secret|ABCD-EFGH|bearer-secret|signed-value|googlevideo\.com/);
 assert.match(safe,/\[REDACTED\]/);
 assert.match(safe,/\[SIGNED URL\]/);
});
