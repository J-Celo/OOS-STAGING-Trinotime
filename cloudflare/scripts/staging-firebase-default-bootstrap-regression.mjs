// Staging-only: named Firebase compat apps must not be mistaken for [DEFAULT].
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for (const file of ['j-5a9b0d9aeabc.js','j-b52f8ff97ca5.js']) {
  const source=readFileSync(new URL('../public/assets/js/'+file,import.meta.url),'utf8');
  const start=source.indexOf('        // Staging RC2: A named Firebase app');
  const end=source.indexOf('        let fbDb = null;', start);
  assert.ok(start > 0 && end > start, file+' helper source');
  const warm=source.slice(start,end);
  assert.match(source, /const defaultApp = ensureDefaultFirebaseApp\(\);/,file+' async path uses helper');
  assert.doesNotMatch(source,/\(!firebase\.apps \|\| !firebase\.apps\.length\) \? firebase\.initializeApp/);

  const config = {projectId:'trinotime-staging-qa',databaseURL:'https://staging-only.example.invalid'};
  function setup(apps, sdkReady=true) {
    const created=[];
    const compat={apps:apps.slice()};
    if(sdkReady) compat.initializeApp=(options,name)=>{
      assert.equal(name,undefined,'default Firebase must not use a name');
      assert.equal(options,config,'must reuse the staging runtime config');
      const app={name:'[DEFAULT]',options:{...options}};
      created.push(app);compat.apps.push(app);return app;
    };
    const context={firebase:compat,window:{firebase: sdkReady ? compat : null},firebaseConfig:config};
    vm.createContext(context);
    vm.runInContext(warm+'\nglobalThis.callEnsureDefault=ensureDefaultFirebaseApp;',context);
    return {context,created,compat};
  }
  // 1. Cold start creates precisely one default app.
  {
    const a=setup([]);
    assert.equal(a.created.length,1);
    assert.equal(a.context.callEnsureDefault(),a.created[0]);
    assert.equal(a.created.length,1);
  }
  // 2. The real regression: named owner-manager exists, [DEFAULT] does not.
  {
    const named={name:'trinotime-premium-owner-manager',options:{projectId:config.projectId}};
    const a=setup([named]);
    assert.equal(a.created.length,1,'a named app never replaces the default');
    assert.deepEqual(a.compat.apps[0],named,'existing named app unchanged');
    assert.equal(a.context.callEnsureDefault().name,'[DEFAULT]');
  }
  // 3. Existing valid default reused, with no initialization or destructive operations.
  {
    const present={name:'[DEFAULT]',options:{projectId:config.projectId}};
    const a=setup([present,{name:'owner-manager'}]);
    assert.equal(a.created.length,0);
    assert.equal(a.context.callEnsureDefault(),present);
  }
  // 4. A previously initialized default for production is a hard failure.
  {
    const a=setup([{name:'[DEFAULT]',options:{projectId:'cwh-timeclock'}}]);
    assert.throws(()=>a.context.callEnsureDefault(),/does not match/);
    assert.equal(a.created.length,0);
  }
  // 5. SDK is delayed: warmup does not crash, async readiness path handles SDK loading.
  {
    const a=setup([],false);
    assert.equal(a.created.length,0);
    assert.throws(()=>a.context.callEnsureDefault(),/core SDK is unavailable/);
  }
  // 6. Any real SDK initialization failure remains observable by the guarded path.
  {
    const a=setup([]);
    a.compat.apps.length=0;
    a.compat.initializeApp=()=>{throw new Error('real Firebase init failure')};
    assert.throws(()=>a.context.callEnsureDefault(),/real Firebase init failure/);
  }
}
console.log('PASS — Firebase [DEFAULT] bootstrap: cold, named-only, existing, project mismatch, delayed SDK and genuine failure');
