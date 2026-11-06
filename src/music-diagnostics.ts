// Log only selected error fields, never raw request objects, headers or tracks.
export function sanitizeError(value:unknown):string {
 let text=typeof value==='string'?value:String(value??'');
 for(const [key,secret] of Object.entries(process.env)){
  if(/TOKEN|PASSWORD|SECRET|API_KEY|AUTHORIZATION/i.test(key)&&secret&&secret.length>=4)text=text.split(secret).join('[REDACTED]');
 }
 return text.replace(/https?:\/\/[^\s<>"']+/gi,'[URL]')
  .replace(/((?:authorization|password|(?:refresh|access)[_-]?token|api[_-]?key|client[_-]?id|visitor[_-]?data)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[REDACTED]')
  .replace(/((?:device|user)[-_ ]?code\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[REDACTED]')
  .replace(/(enter\s+(?:the\s+)?code\s+)[A-Z0-9-]{4,}/gi,'$1[REDACTED]')
  .replace(/\b(?:Bearer|Bot)\s+[^\s,;]+/gi,'[REDACTED AUTH]')
  .replace(/[\r\n\x00-\x1f]/g,' ').replace(/[@`]/g,'').slice(0,600);
}
export function classifyMusicFailure(value:unknown):string|undefined {
 const e=(value&&typeof value==='object'?value:{message:value}) as Record<string,unknown>;
 const cause=e.cause instanceof Error?e.cause.message:e.cause;
 const text=`${String(e.message??'')} ${String(cause??'')}`;
 if(/must find sig function|signature.{0,30}cipher|cipher.{0,30}signature/i.test(text))return 'youtube_signature_cipher';
 if(/this video requires login|sign in to confirm you(?:'|’)re not a bot|login required/i.test(text))return 'youtube_auth_required';
 if(/this video is unavailable|video unavailable/i.test(text))return 'video_unavailable';
 if(/no supported audio streams available|available types:\s*(?:\n|$)/i.test(text))return 'no_audio_formats';
 if(/no playable stream found/i.test(text))return 'no_playable_stream';
 if(/ECONNREFUSED|websocket closed before a connection was established/i.test(text))return 'lavalink_disconnected';
 return undefined;
}
export function reportMusicError(stage:string,error:unknown):string {
 const e=(error&&typeof error==='object'?error:{message:error}) as Record<string,unknown>;
 const fields=['name','message','cause','severity','status','statusCode','code'].flatMap(key=>{
  const val=e[key];
  if(val==null)return [];
  if(typeof val==='string'||typeof val==='number')return [`${key}=${sanitizeError(val)}`];
  if(val instanceof Error)return [`${key}=${sanitizeError(val.message)}`];
  return [];
 });
 const category=classifyMusicFailure(error);
 const detail=[category?`category=${category}`:undefined,fields.join(' | ')||'Detail tidak disediakan Lavalink.'].filter(Boolean).join(' | ');
 const result=`${['YOUTUBE AUTH','YOUTUBE LOAD','YOUTUBE CIPHER'].includes(stage)?`[${stage}]`:`[MUSIC ${stage}]`} ${detail}`;
 console.error(result);
 return result.slice(0,1100);
}
