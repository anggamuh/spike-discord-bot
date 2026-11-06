export function sanitizeLavalinkLine(line,secrets=[]){
 let safe=line;
 for(const secret of secrets)if(secret&&secret.length>=4)safe=safe.split(secret).join('[REDACTED]');
 return safe
  .replace(/(authorization\s*[=:]\s*)(?:(?:bearer|basic)\s+)?[^\s,;]+/gi,'$1[REDACTED]')
  .replace(/((?:refresh|access)[ _-]?token|oauth[_-]?token|client[_-]?secret|password|api[_-]?token)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[REDACTED]')
  .replace(/((?:device|user)[ _-]?code)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[REDACTED]')
  .replace(/(enter\s+(?:the\s+)?code\s+)[A-Z0-9-]{4,}/gi,'$1[REDACTED]')
  .replace(/https?:\/\/[^\s<>"']+/gi,url=>/googlevideo\.com|[?&](?:sig|signature|lsig|spc|expire|oauth_token|access_token|user_code)=/i.test(url)?'[SIGNED URL]':url);
}
