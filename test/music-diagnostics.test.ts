import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMusicFailure,sanitizeError} from '../src/music-diagnostics.js';

test('music diagnostics redact credentials, device codes and signed stream URLs',()=>{
 const previous=process.env.YOUTUBE_REFRESH_TOKEN;
 process.env.YOUTUBE_REFRESH_TOKEN='refresh-secret-value';
 try{
  const result=sanitizeError('refreshToken=refresh-secret-value user_code=ABCD-EFGH enter code ZXCV-1234 https://example.test/stream?sig=private');
  assert.doesNotMatch(result,/refresh-secret-value|ABCD-EFGH|ZXCV-1234|sig=private/);
  assert.match(result,/\[URL\]/);
 }finally{
  if(previous===undefined)delete process.env.YOUTUBE_REFRESH_TOKEN;
  else process.env.YOUTUBE_REFRESH_TOKEN=previous;
 }
});

test('music failures distinguish cipher, authentication, unavailable video and empty formats',()=>{
 assert.equal(classifyMusicFailure({message:'Must find sig function from script'}),'youtube_signature_cipher');
 assert.equal(classifyMusicFailure({message:'This video requires login'}),'youtube_auth_required');
 assert.equal(classifyMusicFailure({message:'This video is unavailable'}),'video_unavailable');
 assert.equal(classifyMusicFailure({message:'No supported audio streams available, available types:'}),'no_audio_formats');
 assert.equal(classifyMusicFailure({message:'No playable stream found'}),'no_playable_stream');
});
