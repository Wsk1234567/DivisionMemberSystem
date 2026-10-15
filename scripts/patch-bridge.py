from pathlib import Path

p = Path('apps-script/admin/Code.gs')
text = p.read_text(encoding='utf-8')
if "mode === 'bridge'" in text:
    print('bridge route already present')
else:
    needle = "  const wantLogin = params.mode === 'login' || params.mode === 'portal' || params.portal === '1';"
    idx = text.find(needle)
    if idx < 0:
        raise SystemExit('needle not found')
    insert = "  if (params.mode === 'bridge') return HtmlService.createHtmlOutput(bridgeHtml_());\n"
    text = text[:idx] + insert + text[idx:]
    p.write_text(text, encoding='utf-8')
    print('inserted bridge route')

text = p.read_text(encoding='utf-8')
print('has apiRpc', 'function apiRpc' in text)
print('has bridgeHtml_', 'function bridgeHtml_' in text)
print('has bridge route', "mode === 'bridge'" in text)
