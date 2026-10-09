/* Auth lifecycle regressions use a simulated SDK and fabricated records only. */
const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function mockSDK(){
  const user={user:{id:'TEST_ONLY_ACCOUNT'}},tables={jobs:[{id:'TEST_JOB',title:'TEST ONLY private job',status:'Booked',scheduled_at:'2099-10-15T10:00:00Z',price:45}],customers:[{id:'TEST_CUSTOMER',name:'TEST ONLY private customer'}],expenses:[],leads:[{id:'TEST_LEAD',title:'TEST ONLY private opportunity',status:'New opportunity',priority:'P2',received_amount:0}]};
  window.__authEvents=[];window.__privateReads=0;window.__delaySession=false;window.__delaySignIn=false;window.__delayPassword=false;window.__failTable=null;
  window.supabase={createClient:()=>{let callback;const client={auth:{
    onAuthStateChange(fn){callback=fn;window.__authEvents.push(fn);window.__authEvent=fn;return {data:{subscription:{unsubscribe(){}}}};},
    getSession:()=>window.__delaySession?new Promise(resolve=>window.__resolveSession=resolve):Promise.resolve({data:{session:user},error:null}),
    signInWithPassword:()=>window.__delaySignIn?new Promise(resolve=>window.__resolveSignIn=resolve):Promise.resolve().then(()=>{callback('SIGNED_IN',user);return {data:{session:user},error:null};}),
    signOut:async()=>{callback('SIGNED_OUT',null);return {error:null};},
    updateUser:()=>window.__delayPassword?new Promise(resolve=>window.__resolvePassword=resolve):Promise.resolve({data:{user:user.user},error:null}),
    resetPasswordForEmail:()=>new Promise(resolve=>window.__resolveReset=resolve)
  },rpc:async()=>({data:{is_admin:true,schema_version:1},error:null}),
  from:table=>{let range;const q={select(){return q;},order(){return q;},range(a,b){range=[a,b];return q;},then(resolve,reject){window.__privateReads++;if(window.__failTable===table)return Promise.resolve({error:{message:'TEST ONLY record read unavailable'}}).then(resolve,reject);const rows=structuredClone(tables[table]||[]);return Promise.resolve({data:range?rows.slice(range[0],range[1]+1):rows,error:null}).then(resolve,reject);}};return q;}};return client;}};
}
async function main(){
  const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));try{if(!file.startsWith(root+path.sep))throw new Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'image/png');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const base='http://127.0.0.1:'+server.address().port,errors=[];
    async function page(){
      const context=await browser.newContext({viewport:{width:393,height:852}});
      await context.route('**/*',route=>{const url=route.request().url();
        if(url.endsWith('/supabase-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.RM_CONFIG={supabaseUrl:"https://test-only.supabase.co",supabaseKey:"sb_publishable_TEST_ONLY_BROWSER_KEY"};'});
        if(url.startsWith(base))return route.continue();
        if(url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:'('+mockSDK.toString()+')();'});
        return route.abort();
      });
      const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
      await p.goto(base+'/admin.html');await p.getByRole('heading',{name:'Your business, at a glance',exact:true}).waitFor();return p;
    }
    async function signedOut(p){await p.getByRole('heading',{name:'Sign in',exact:true}).waitFor();assert.equal(await p.locator('.nav').count(),0);assert.equal(await p.evaluate(()=>adminReady),false);assert.equal(await p.evaluate(()=>jobRows.length+customerRows.length+expenseRows.length+leadRows.length),0);assert(!(await p.locator('body').innerText()).includes('TEST ONLY private'));}
    async function pendingSignIn(p){await p.getByLabel('Email',{exact:true}).fill('test-only@example.invalid');await p.getByLabel('Password',{exact:true}).fill('TEST_ONLY_password');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForFunction(()=>!!window.__resolveSignIn);}
    const switched=await page();await switched.evaluate(()=>__authEvent('SIGNED_IN',{user:{id:'TEST_ONLY_SECOND_ACCOUNT'}}));await signedOut(switched);console.log('PASS: Account switch immediately removes previous private DOM and caches');

    const startup=await page();await startup.evaluate(()=>{__delaySession=true;start();});await startup.waitForFunction(()=>!!window.__resolveSession);await startup.evaluate(()=>__authEvent('SIGNED_OUT',null));await signedOut(startup);await startup.evaluate(()=>__resolveSession({data:{session:{user:{id:'TEST_ONLY_ACCOUNT'}}},error:null}));await startup.waitForTimeout(100);await signedOut(startup);console.log('PASS: Late getSession result cannot reopen private records after sign-out');

    const signin=await page();await signin.getByRole('button',{name:'Log out',exact:true}).click();await signin.evaluate(()=>__delaySignIn=true);await pendingSignIn(signin);await signin.evaluate(()=>__authEvent('SIGNED_OUT',null));await signin.evaluate(()=>__resolveSignIn({data:{session:{user:{id:'TEST_ONLY_ACCOUNT'}}},error:null}));await signin.waitForTimeout(100);await signedOut(signin);console.log('PASS: Late sign-in result cannot reopen private records after sign-out');

    const renewed=await page();await renewed.getByRole('button',{name:'Log out',exact:true}).click();await renewed.evaluate(()=>__delaySignIn=true);await pendingSignIn(renewed);await renewed.evaluate(()=>{window.__oldSignIn=__resolveSignIn;__authEvent('SIGNED_OUT',null);__delaySignIn=false;});await renewed.getByLabel('Email',{exact:true}).fill('test-only@example.invalid');await renewed.getByLabel('Password',{exact:true}).fill('TEST_ONLY_password');await renewed.getByRole('button',{name:'Sign in',exact:true}).click();await renewed.getByRole('heading',{name:'Your business, at a glance',exact:true}).waitFor();await renewed.getByRole('button',{name:'More',exact:true}).click();const reads=await renewed.evaluate(()=>__privateReads);await renewed.evaluate(()=>__oldSignIn({data:{session:{user:{id:'TEST_ONLY_ACCOUNT'}}},error:null}));await renewed.waitForTimeout(100);assert.equal(await renewed.evaluate(()=>__privateReads),reads);assert(await renewed.getByRole('heading',{name:'Tools for the next job',exact:true}).isVisible());console.log('PASS: Late same-account sign-in cannot overwrite a newer authenticated view');

    const password=await page();await password.evaluate(()=>{showPasswordReset();__delayPassword=true;});await password.getByLabel('New password',{exact:true}).fill('TEST_ONLY_new_password');await password.getByLabel('Confirm password',{exact:true}).fill('TEST_ONLY_new_password');await password.getByRole('button',{name:'Save new password',exact:true}).click();await password.waitForFunction(()=>!!window.__resolvePassword);await password.evaluate(()=>{__authEvent('SIGNED_OUT',null);__resolvePassword({data:{user:{id:'TEST_ONLY_ACCOUNT'}},error:null});});await password.waitForTimeout(100);await signedOut(password);console.log('PASS: Late password-update response cannot reopen private records after sign-out');

    const oldClient=await page();await oldClient.evaluate(()=>{window.__oldAuthEvent=__authEvents[0];start();});await oldClient.getByRole('heading',{name:'Your business, at a glance',exact:true}).waitFor();await oldClient.evaluate(()=>__oldAuthEvent('SIGNED_OUT',null));assert(await oldClient.getByRole('heading',{name:'Your business, at a glance',exact:true}).isVisible());assert.equal(await oldClient.evaluate(()=>adminReady),true);console.log('PASS: Superseded client auth callback cannot sign out the current connection');

    const recovery=await page();await recovery.evaluate(()=>{__delaySession=true;start();});await recovery.waitForFunction(()=>!!window.__resolveSession);await recovery.evaluate(()=>{__authEvent('PASSWORD_RECOVERY',{user:{id:'TEST_ONLY_ACCOUNT'}});__resolveSession({data:{session:{user:{id:'TEST_ONLY_ACCOUNT'}}},error:null});});await recovery.waitForTimeout(100);assert(await recovery.getByRole('heading',{name:'Set a new password',exact:true}).isVisible());assert.equal(await recovery.locator('.nav').count(),0);console.log('PASS: Late startup response preserves the password-recovery view');

    const reset=await page();await reset.getByRole('button',{name:'Log out',exact:true}).click();await reset.getByRole('button',{name:'Forgot password?',exact:true}).click();await reset.getByLabel('Account email',{exact:true}).fill('test-only@example.invalid');await reset.getByRole('button',{name:'Email reset link',exact:true}).click();await reset.waitForFunction(()=>!!window.__resolveReset);await reset.evaluate(()=>{__authEvent('PASSWORD_RECOVERY',{user:{id:'TEST_ONLY_ACCOUNT'}});__resolveReset({data:{},error:null});});await reset.waitForTimeout(100);assert(await reset.getByRole('heading',{name:'Set a new password',exact:true}).isVisible());assert.equal(await reset.getByRole('heading',{name:'Check your email',exact:true}).count(),0);console.log('PASS: Late reset-email response preserves the newer password-recovery view');

    const backup=await page();const [download]=await Promise.all([backup.waitForEvent('download'),backup.getByRole('button',{name:'Export business records',exact:true}).click()]);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const content=Buffer.concat(chunks).toString(),data=JSON.parse(content);assert.equal(Object.keys(data.tables).length,9);assert.equal(data.tables.leads[0].id,'TEST_LEAD');assert(!content.includes('sb_publishable_'));assert(!content.includes('TEST_ONLY_ACCOUNT'));console.log('PASS: Full private export includes fabricated lead records without connection keys or auth identifiers');
    const incomplete=await page();let downloads=0;incomplete.on('download',()=>downloads++);await incomplete.evaluate(()=>__failTable='leads');await incomplete.getByRole('button',{name:'Export business records',exact:true}).click();await incomplete.locator('#exportError').filter({hasText:'Load leads: TEST ONLY record read unavailable'}).waitFor();assert.equal(downloads,0);assert(await incomplete.getByRole('button',{name:'Export business records',exact:true}).isEnabled());console.log('PASS: Failed lead read reports an export error and never downloads a partial backup');
    assert.deepEqual(errors,[]);console.log('PASS: No page errors in simulated auth lifecycle checks');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
