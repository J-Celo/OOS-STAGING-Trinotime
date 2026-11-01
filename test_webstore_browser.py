from playwright.sync_api import sync_playwright
from pathlib import Path
js=Path('/mnt/data/trinotime-webstore-edit/cloudflare/public/assets/js/j-tracker-download-rc33.js').read_text()
html='''<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="appRoot">
  <nav id="ttCoverageWorkspaceTabs"><button data-tt-nav="metrics">Metrics</button></nav>
  <aside id="ttPremiumSidebar"><nav class="tt-premium-nav"><button data-tt-nav="install">Install</button></nav></aside>
</div>
</body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=browser.new_context()
 page=context.new_page()
 page.set_content(html)
 page.add_script_tag(content=js)
 page.wait_for_timeout(300)
 selectors=['[data-tt-tracker-download="premium"]','[data-tt-tracker-download="standard"]']
 for sel in selectors:
  el=page.locator(sel)
  assert el.count()==1,(sel,el.count())
  assert el.evaluate('(x)=>x.tagName')=='A'
  assert el.get_attribute('href')=='https://chromewebstore.google.com/detail/lhglagmphokkpfkkdckogjlniipneill'
  assert el.get_attribute('target')=='_blank'
  assert 'noopener' in el.get_attribute('rel') and 'noreferrer' in el.get_attribute('rel')
  assert 'STG' in el.inner_text()
 # Reentrant navigation events must not create duplicate links.
 page.evaluate("document.dispatchEvent(new Event('trinotime:workspace-opening'))")
 assert page.locator('[data-tt-tracker-download]').count()==2
 # A stale preexisting button should be replaced by a store link, not clicked to download.
 page.evaluate("""() => { const nav = document.getElementById('ttCoverageWorkspaceTabs'); const link=nav.querySelector('[data-tt-tracker-download]'); const old=document.createElement('button'); old.dataset.ttTrackerDownload='standard'; old.textContent='Old ZIP';link.replaceWith(old);document.dispatchEvent(new Event('trinotime:workspace-opening')); }""")
 assert page.locator('[data-tt-tracker-download="standard"]').evaluate('(x)=>x.tagName')=='A'
 assert page.locator('[data-tt-tracker-download]').count()==2
 print('PASS: Standard and Premium links, STG identity, safe new tab, no ZIP-click path, idempotent navigation, stale-button replacement')
 browser.close()
