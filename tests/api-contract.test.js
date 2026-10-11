import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

test('unauthenticated admin requests are rejected and explicitly uncached',async()=>{
  const env={ADMIN_TOKEN:'testing-only',CORS_ORIGIN:'https://siegeviperx.github.io'};
  for(const [path,method] of [
    ['/admin/match-external-ids?cursor=0&limit=20','POST'],
    ['/admin/collect-steam-signals?cursor=0&limit=5','POST'],
    ['/admin/export-signals?cursor=0&limit=200','GET'],
  ]){
    const r=await worker.fetch(new Request('https://example.invalid'+path,{method}),env);
    assert.equal(r.status,401);
    assert.match(r.headers.get('cache-control'),/no-store/);
    assert.equal((await r.json()).error,'unauthorized');
  }
});
test('forecast routes still explicitly abstain without validated models',async()=>{
  const r=await worker.fetch(new Request('https://example.invalid/forecasts/23248'),{CORS_ORIGIN:'https://siegeviperx.github.io'});
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.status,'insufficient_data');
  assert.equal(data.probability,null);
});
