/* Customer-facing browser audit. Never contacts WhatsApp/email/phone or writes real business records. */
const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = process.env.RM_AUDIT_OUTPUT || '/tmp/rm-production-audit';
const live = process.env.RM_AUDIT_LIVE === '1';
const checks = [], errors = [], consoleErrors = [], failures = [], responses = [], requests = [], metrics = [], links = [];
let server, browser, base;
fs.mkdirSync(out, { recursive: true });
async function check(name, fn) {
  try { const detail = await fn(); checks.push({ name, passed: true, ...(detail ? { detail } : {}) }); console.log('PASS:', name); }
  catch (e) { checks.push({ name, passed: false, reason: e.message }); console.log('FAIL:', name, e.message); }
}
function mime(file) { return ({'.html':'text/html','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.xml':'application/xml'})[path.extname(file)] || 'text/plain'; }
async function context(options = {}) {
  const c = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined, ...options });
  await c.addInitScript(() => {
    window.__openCalls = []; window.open = u => { window.__openCalls.push(String(u)); return null; };
    // Block protocol-handler and popup anchors while still exercising their click handlers.
    document.addEventListener('click', e => { const a = e.target.closest('a'); if (a && (/^(tel:|mailto:)/.test(a.href) || a.target === '_blank')) { window.__openCalls.push(a.href); e.preventDefault(); } }, true);
  });
  await c.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    requests.push({ path: u.pathname, host: u.hostname, method: req.method(), resource: req.resourceType() });
    if (/^(POST|PUT|PATCH|DELETE)$/.test(req.method()) && u.pathname !== '/rest/v1/rpc/rm_public_site') {
      failures.push({ path: u.pathname, reason: 'Blocked potential real mutation by audit harness' }); return route.abort();
    }
    if (u.origin !== new URL(base).origin || live) {
      // Fetch through the configured session proxy with Node's existing CA trust.
      // TLS remains verified; this avoids changing Chromium's persistent trust store.
      const response = await route.fetch({timeout:30000}); return route.fulfill({response});
    }
    return route.continue();
  });
  const p = await c.newPage();
  p.on('pageerror', e => errors.push({ page: new URL(p.url()).pathname, message: e.message }));
  p.on('console', m => { if (m.type() === 'error') consoleErrors.push({ page: new URL(p.url()).pathname, message: m.text() }); });
  p.on('requestfailed', req => failures.push({ path: new URL(req.url()).pathname, reason: req.failure()?.errorText }));
  p.on('response', res => { if (res.status() >= 400) responses.push({ path: new URL(res.url()).pathname, status: res.status() }); });
  return p;
}
async function ready(p, route = '/') {
  await p.goto(base + route, { waitUntil: 'networkidle', timeout: 45000 });
  if (await p.evaluate(() => typeof rmCmsReady !== 'undefined')) await p.evaluate(() => rmCmsReady);
}
async function main() {
  if (live) base = process.env.RM_AUDIT_URL || 'https://www.rmsmalljobs.co.uk';
  else {
    server = http.createServer((req, res) => {
      const relative = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      let file = path.resolve(root, '.' + relative);
      if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
      try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); res.setHeader('Content-Type', mime(file)); res.end(fs.readFileSync(file)); }
      catch { res.writeHead(404); res.end('Not found'); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const home = await context(); await ready(home);
    await check('Homepage loads with RM Small Jobs title and one main heading', async () => {
      assert.match(await home.title(), /RM Small Jobs/); assert.equal(await home.locator('h1').count(), 1);
      return { cms: await home.evaluate(() => window.rmCmsState) };
    });
    for (const route of ['/', '/thank-you/', '/admin.html']) {
      const p = await context(); await ready(p, route);
      for (const [width, height] of [[320,568],[375,667],[393,852],[430,932],[768,1024],[1440,900],[852,393]]) {
        await check(`${route} layout ${width}×${height}: no horizontal overflow or broken visible images`, async () => {
          await p.setViewportSize({width,height});
          assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
          for (const img of await p.locator('img:visible').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(e => e.complete ? Promise.resolve() : new Promise(resolve => { e.addEventListener('load',resolve,{once:true}); e.addEventListener('error',resolve,{once:true}); setTimeout(resolve,5000); })); }
          const broken = await p.locator('img:visible').evaluateAll(imgs => imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')));
          assert.deepEqual(broken, []);
          if (width === 393 || width === 1440) { await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});}); await p.waitForTimeout(100); }
          if (width === 393 || width === 1440) await p.screenshot({path:path.join(out, (route === '/' ? 'home' : route.includes('admin') ? 'admin' : 'next-steps') + '-' + width + '.png'),fullPage:true});
        });
      }
      await check(`${route} same-site links and hash targets resolve`, async () => {
        const pageLinks = await p.locator('a').evaluateAll(as => as.map(a => ({text:a.innerText.trim(),href:a.href,raw:a.getAttribute('href')})));
        for (const l of pageLinks) {
          links.push({page:route,...l}); const url = new URL(l.href);
          if (url.origin !== new URL(base).origin) continue;
          if (url.pathname === new URL(p.url()).pathname && url.hash) assert.equal(await p.locator(url.hash).count(),1,'Missing target '+url.hash);
          else { const response = await p.request.get(url.href); assert(response.ok(), 'Bad internal link '+url.pathname); }
        }
        return {links:pageLinks.length};
      });
      if (route === '/admin.html') await check('Signed-out admin shows sign-in/setup and no private record content', async () => {
        assert((await p.getByRole('heading', {name:/Sign in|Connect your business app/}).count()) === 1);
        assert.equal(await p.locator('.nav').count(),0); assert.equal(await p.locator('.stat').count(),0);
        return { heading: await p.locator('h1').innerText(), authentication: 'No login attempted' };
      });
      await p.context().close();
    }
    await home.setViewportSize({width:393,height:852});
    await check('Mobile menu opens, Escape closes and restores focus', async () => {
      await home.getByRole('button',{name:'Open menu',exact:true}).click(); assert.equal(await home.locator('#menu').getAttribute('aria-expanded'),'true');
      assert(await home.locator('#nav').isVisible()); await home.keyboard.press('Escape');
      assert.equal(await home.locator('#menu').getAttribute('aria-expanded'),'false'); assert.equal(await home.evaluate(()=>document.activeElement.id),'menu');
    });
    for (const name of ['Services','How it works','Areas','About','Get a quote']) await check(`Mobile navigation: ${name}`, async () => {
      await home.locator('#menu').click(); const a = home.locator('#nav a').filter({hasText:new RegExp('^'+name+'$')});
      const hash = await a.getAttribute('href'); await a.click(); assert.equal(new URL(home.url()).hash, hash);
      assert.equal(await home.locator('#menu').getAttribute('aria-expanded'),'false');
    });
    await check('Mobile landscape menu: final WhatsApp link reachable',async()=>{
      try { await home.setViewportSize({width:852,height:393}); await home.locator('#menu').click(); const last=home.locator('#nav a').last(); await last.scrollIntoViewIfNeeded(); const box=await last.boundingBox(); assert(box && box.y>=0 && box.y+box.height<=393,'Final menu item clips below viewport'); } finally { await home.keyboard.press('Escape'); await home.setViewportSize({width:393,height:852}); }
    });
    await check('Mobile menu dismisses outside and resets after desktop resize',async()=>{
      try { await home.locator('#menu').click(); await home.mouse.click(5,500); assert.equal(await home.locator('#menu').getAttribute('aria-expanded'),'false');
      await home.locator('#menu').click(); await home.setViewportSize({width:1440,height:900}); await home.waitForTimeout(100); assert.equal(await home.locator('#menu').getAttribute('aria-expanded'),'false'); } finally { await home.keyboard.press('Escape'); await home.setViewportSize({width:393,height:852}); }
    });
    await check('Hero/header/home hash links navigate to existing sections',async()=>{
      for(const selector of ['a.brand','.mobile-quote','.hero a[href="#quote"]','.hero a[href="#services"]']) {
        const a=home.locator(selector).first(),href=await a.getAttribute('href'); await a.click(); assert.equal(new URL(home.url()).hash,href); assert.equal(await home.locator(href).count(),1);
      }
    });
    await check('Every public WhatsApp anchor creates a retryable handoff without sending',async()=>{
      const anchors=home.locator('a[href^="https://wa.me/"]:not(#reopenWhatsApp)');
      for(let i=0;i<await anchors.count();i++) {
        const a=anchors.nth(i); if(await a.evaluate(e=>e.closest('nav')!==null))await home.locator('#menu').click();
        const href=await a.getAttribute('href'),before=await home.evaluate(()=>__openCalls.length); await a.click();
        assert.equal(await home.evaluate(()=>__openCalls.length),before+1); assert.equal(await home.evaluate(()=>__openCalls.at(-1)),href); assert(await home.locator('#quoteFollowUp').isVisible()); await home.locator('#editQuote').click();
      }
      await home.evaluate(()=>__openCalls=[]);
    });
    await check('Every phone/email anchor has a consistent handler destination',async()=>{
      for(const a of await home.locator('a[href^="tel:"]:visible,a[href^="mailto:"]:visible').all()) { const href=await a.getAttribute('href'); await a.click(); assert.equal(await home.evaluate(()=>__openCalls.at(-1)),href); }
      await home.evaluate(()=>__openCalls=[]); return {verification:'Click destinations captured; carrier/email delivery not attempted'};
    });
    const serviceNames = await home.locator('#cmsServices a').evaluateAll(as=>as.map(a=>a.dataset.service));
    for (const name of serviceNames) await check(`Service selection with keyboard: ${name}`, async () => {
      const a = home.locator('#cmsServices a').filter({hasText:name}); await a.focus(); await home.keyboard.press('Enter');
      assert.match(await home.locator('#quoteServiceName').innerText(), new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      assert(await home.locator('#quoteForm').isVisible()); assert.equal(await home.evaluate(()=>document.activeElement.id),'qArea');
    });
    await check('Clear service choice hides hint and focuses job details', async () => {
      await home.getByRole('button',{name:'Clear service choice',exact:true}).click(); assert(await home.locator('#quoteServiceHint').isHidden()); assert.equal(await home.evaluate(()=>document.activeElement.id),'qJob');
    });
    await check('Enquiry required fields reject whitespace without opening WhatsApp', async () => {
      await home.locator('#qArea').fill('   '); await home.locator('#qJob').fill('   '); await home.locator('#quoteForm button[type="submit"]').click();
      assert.equal(await home.evaluate(()=>__openCalls.length),0); assert.equal(await home.locator('#qArea').evaluate(e=>e.validity.valid),false);
    });
    await check('Enquiry opens one correctly addressed/encoded WhatsApp draft and explains manual send', async () => {
      if (serviceNames.length) await home.locator('#cmsServices a').first().click();
      await home.locator('#qName').fill('TEST ONLY — no customer'); await home.locator('#qArea').fill('TEST ONLY ML1'); await home.locator('#qJob').fill('TEST ONLY shelves & bracket, £45? <script>');
      await home.locator('#quoteForm button[type="submit"]').click();
      const opened=await home.evaluate(()=>__openCalls.at(-1)); const u=new URL(opened); assert.equal(u.hostname,'wa.me');
      const target=await home.evaluate(()=>window.rmPublicContact?.whatsapp||'447365309553'); assert.equal(u.pathname,'/'+target);
      assert.match(u.searchParams.get('text'),/TEST ONLY shelves & bracket, £45\? <script>/); assert(await home.locator('#quoteForm').isHidden()); assert(await home.locator('#quoteFollowUp').isVisible());
      assert.match(await home.locator('#quoteFollowUp').innerText(),/send|Send/); assert.match(await home.locator('#quoteFollowUp').innerText(),/isn’t a booking|doesn.t confirm/);
      assert.equal(await home.evaluate(()=>document.activeElement.id),'quoteFollowUp');
      return {delivery:'Simulated browser handoff only; no WhatsApp message or database insert attempted'};
    });
    await check('Retry retains identical WhatsApp draft; edit preserves typed fields', async () => {
      const before=await home.locator('#reopenWhatsApp').getAttribute('href'); await home.locator('#reopenWhatsApp').click();
      assert.equal(await home.evaluate(()=>__openCalls.at(-1)),before); await home.getByRole('button',{name:'Edit job details',exact:true}).click();
      assert.equal(await home.locator('#qName').inputValue(),'TEST ONLY — no customer'); assert.equal(await home.locator('#qArea').inputValue(),'TEST ONLY ML1');
      assert.equal(await home.evaluate(()=>document.activeElement.id),'qName');
    });
    await check('Form reload draft retention (observation)',async()=>{
      await home.reload({waitUntil:'networkidle'}); return {retained:await home.locator('#qJob').inputValue() === 'TEST ONLY shelves & bracket, £45? <script>', requirement:'Observation; draft retention is not currently a stated feature'};
    });
    await check('Customer inputs have sensible length bounds and iPhone-safe font sizing',async()=>{
      for(const [id,max] of [['qName',80],['qArea',100],['qJob',2000]]) { assert.equal(await home.locator('#'+id).getAttribute('maxlength'),String(max)); assert(await home.locator('#'+id).evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16)); }
    });
    await check('WhatsApp open exception still provides visible retry and contact route',async()=>{
      await home.locator('#qArea').fill('TEST ONLY ML1'); await home.locator('#qJob').fill('TEST ONLY open error'); await home.evaluate(()=>window.open=()=>{throw new Error('TEST ONLY popup unavailable')}); await home.locator('#quoteForm button[type=submit]').click(); assert(await home.locator('#reopenWhatsApp').isVisible()); assert.match(await home.locator('#whatsAppHelp').innerText(),/couldn’t open/); assert(await home.locator('a[href^="tel:"]').first().count());
    });
    if(!live) await check('Simulated published CMS updates visible services and SEO without stale fallback prices',async()=>{
      const p=await context(); const data={published:true,settings:{headline:'Small jobs. Done properly.',intro:'TEST ONLY published introduction',boundary:'TEST ONLY pricing note',phone:'07700 900123',whatsapp:'447700900123',email:'test-only@example.invalid'},services:[{name:'TEST ONLY picture hanging',price:'From £99',description:'TEST ONLY description'}],areas:[{name:'Wishaw'}],faqs:[],gallery:[]};
      await p.route('**/rest/v1/rpc/rm_public_site',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)})); await ready(p);
      assert.equal((await p.evaluate(()=>rmCmsState)).status,'published'); assert.equal(await p.locator('#cmsServices .price').innerText(),'From £99');
      const meta=await p.locator('meta[name="description"]').getAttribute('content'); assert.match(meta,/Wishaw/); assert.match(meta,/TEST ONLY picture hanging/); assert(!/£45|£30/.test(meta)); assert.match(await p.title(),/Wishaw/);
      const ld=JSON.parse(await p.locator('script[type="application/ld+json"]').textContent()); assert.deepEqual(ld.areaServed,['Wishaw']); assert.equal(ld.telephone,'+447700900123'); await p.context().close();
    });
    if(!live) await check('Simulated long published CMS text remains usable at 320/375/393 pixels',async()=>{
      const p=await context(),long='TESTONLY'+ 'W'.repeat(120); const data={published:true,settings:{headline:long,intro:long,boundary:long,phone:'07700 900123',whatsapp:'447700900123',email:'test-only@example.invalid'},services:[{name:long,price:long,description:long}],areas:[{name:long}],faqs:[{question:long,answer:long}],gallery:[]};
      await p.route('**/rest/v1/rpc/rm_public_site',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)})); await ready(p);
      for(const width of [320,375,393]) { await p.setViewportSize({width,height:852}); assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long CMS overflow '+width+' '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,cls:e.className,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})).filter(e=>e.x+e.width>innerWidth).slice(0,18)))); }
      await p.locator('#cmsServices a').first().click(); assert(await p.locator('#quoteServiceHint').isVisible()); assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Selected long CMS service overflow '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,cls:e.className,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})).filter(e=>e.x+e.width>innerWidth).slice(0,18)))); await p.screenshot({path:path.join(out,'long-cms-mobile.png'),fullPage:true}); await p.context().close();
    });
    for (const name of ['home','next']) {
      const p=await context({javaScriptEnabled:false}); await p.goto(base+(name==='home'?'/':'/thank-you/'),{waitUntil:'networkidle'});
      await check(`JavaScript disabled ${name}: visible contact route and no visible nonfunctional enquiry form`,async()=>{
        assert(await p.locator('a[href^="tel:"]').first().isVisible()); assert(await p.locator('a[href^="https://wa.me/"]').last().isVisible());
        if(name==='home')assert(await p.locator('#quoteForm').isHidden()); assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }); await p.context().close();
    }
    await check('Next steps never claims enquiry was delivered for success=true URL',async()=>{
      const p=await context(); await ready(p,'/thank-you/?success=true'); assert.match(await p.locator('body').innerText(),/can’t confirm|cannot confirm/); await p.context().close();
    });
    await check('Phone/email/WhatsApp contacts are consistent across customer pages',async()=>{
      const numbers=new Set(),emails=new Set(),whatsapp=new Set();
      for(const l of links){if(l.page==='/admin.html')continue; if(l.href.startsWith('tel:'))numbers.add(l.href.replace(/\D/g,'')); if(l.href.startsWith('mailto:'))emails.add(l.href);if(l.href.startsWith('https://wa.me/'))whatsapp.add(new URL(l.href).pathname);}
      assert.equal(numbers.size,1);assert.equal(emails.size,1);assert.equal(whatsapp.size,1); return {telephoneRoutes:numbers.size,emailRoutes:emails.size,whatsappRoutes:whatsapp.size};
    });
    await check('Homepage resource/loading observations',async()=>{
      const m=await home.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(n=>({domContentLoaded:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd),transferBytes:n.transferSize})),resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,durationMs:Math.round(r.duration),transferBytes:r.transferSize}))})); metrics.push(m); return m;
    });
    await check('No uncaught JavaScript errors, failed requests or HTTP errors',async()=>{
      assert.deepEqual(errors,[]); assert.deepEqual(failures,[]); assert.deepEqual(responses,[]); assert.deepEqual(consoleErrors,[]);
    });
  } finally {
    if(browser)await browser.close(); if(server)await new Promise(r=>server.close(r));
    const report={checked_at:new Date().toISOString(),mode:live?'live read-only':'local code with real anonymous CMS reads',base,network_transport:'TLS verified through existing session proxy via Playwright route.fetch; browser trust settings unchanged',checks,errors,consoleErrors,failures,responses,requests,links,metrics,mutation_requests:requests.filter(r=>/POST|PUT|PATCH|DELETE/.test(r.method)&&r.path!=='/rest/v1/rpc/rm_public_site').length};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)); console.log(checks.filter(c=>c.passed).length+'/'+checks.length+' checks passed; report: '+path.join(out,'results.json'));
    if(checks.some(c=>!c.passed))process.exitCode=1;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
