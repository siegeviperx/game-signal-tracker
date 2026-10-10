import test from 'node:test';
import assert from 'node:assert/strict';
import {clampInt,precisionLabel,releaseRange,safeSearch} from '../worker/src/core.js';
test('pagination is bounded',()=>{assert.equal(clampInt('999',24,100),100);assert.equal(clampInt('-1',24,100),24)});
test('year precision covers whole year',()=>{const t=Date.UTC(2027,5,2)/1000;const [a,b]=releaseRange(3,t);assert.equal(new Date(a*1000).toISOString().slice(0,10),'2027-01-01');assert.equal(new Date(b*1000).toISOString().slice(0,10),'2027-12-31')});
test('missing release is TBA',()=>assert.equal(precisionLabel(4,null,null).label,'TBA'));
test('query bounds',()=>assert.equal(safeSearch('a'.repeat(100)).length,80));
