from pathlib import Path

p = Path('apps-script/admin/Code.gs')
text = p.read_text(encoding='utf-8')

old = """  if (!email || String(info.email_verified) === 'false') throw new Error('Google account is not verified.');
  return actorFromEmail_(email);
}"""
new = """  if (!email || String(info.email_verified) === 'false') throw new Error('Google account is not verified.');
  const clientId = String(properties_().getProperty('GOOGLE_CLIENT_ID') || '').trim();
  const aud = String(info.aud || '');
  if (clientId && aud !== clientId) throw new Error('Google sign-in client mismatch.');
  if (!clientId && aud && !/\\.apps\\.googleusercontent\\.com$/.test(aud)) throw new Error('Google sign-in audience is invalid.');
  return actorFromEmail_(email);
}"""
if old not in text:
    raise SystemExit('verify tail not found')
text = text.replace(old, new, 1)

# bridge origin check: replace the one-liner bridgeHtml_ return
start = text.find('function bridgeHtml_()')
end = text.find('function apiRpc(', start)
if start < 0 or end < 0:
    raise SystemExit('bridgeHtml_/apiRpc not found')
new_bridge = r"""function bridgeHtml_() {
  const origin = String(properties_().getProperty('PUBLIC_SITE_URL') || 'https://wsk1234567.github.io').replace(/\/$/, '');
  const allowJs = JSON.stringify(origin);
  return '<!doctype html><meta charset="utf-8"><title>TCCD bridge</title><body><script>(function(){var allow=' + allowJs + ';function ok(e){return e&&e.origin===allow;}window.addEventListener("message",function(e){if(!ok(e)||!e.data||!e.data.kptBridge)return;var id=e.data.id;google.script.run.withSuccessHandler(function(r){try{e.source.postMessage({kptBridge:true,id:id,result:r},e.origin);}catch(err){}}).withFailureHandler(function(err){try{e.source.postMessage({kptBridge:true,id:id,result:{ok:false,error:String(err&&err.message||err)}},e.origin);}catch(err2){}}).apiRpc(e.data.payload);});try{parent.postMessage({kptBridgeReady:true},allow);}catch(err){try{parent.postMessage({kptBridgeReady:true},"*");}catch(err2){}}})();<\/script></body>';
}
"""
text = text[:start] + new_bridge + text[end:]
p.write_text(text, encoding='utf-8')
print('Code.gs security patched')
print('aud check', 'GOOGLE_CLIENT_ID' in text)
print('bridge allow', 'kptBridgeReady' in text)
