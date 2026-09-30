import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMeta, validateSources, graphQuery, pagedEvents, comparableEvent, GOVERNOR, MANA } from '../scripts/validation.mjs';
const cid = 'Qm' + 'a'.repeat(44);
test('rejects wrong deployment, errors and an incorrect historical anchor', () => {
  const meta = {deployment:cid,hasIndexingErrors:false,block:{number:50000000,hash:'0xabc'}};
  validateMeta(meta,cid,50000000,'0xabc');
  assert.throws(()=>validateMeta(meta,'Qm'+'b'.repeat(44)), /DEPLOYMENT/);
  assert.throws(()=>validateMeta({...meta,hasIndexingErrors:true},cid), /INDEXING_ERRORS/);
  assert.throws(()=>validateMeta(meta,cid,50000001,'0xabc'), /ANCHOR/);
  assert.throws(()=>validateMeta(meta,cid,50000000,'0xdef'), /HASH/);
  // Studio's number-based metadata may have no hash: never accept it as proof.
  assert.throws(()=>validateMeta({...meta,block:{number:50000000,hash:null}},cid,50000000,'0xabc'), /HASH/);
  assert.throws(()=>validateMeta({...meta,block:{number:100}},cid), /NOT_READY/);
});
test('accepts only the exact Polygon source identities and start blocks', () => {
  const stats = {chainId:137,governor:GOVERNOR,mana:MANA,governorStartBlock:'48674443',manaStartBlock:'45785116'};
  validateSources(stats);
  for (const change of [{chainId:1},{mana:GOVERNOR},{governorStartBlock:'0'}]) assert.throws(()=>validateSources({...stats,...change}));
});
test('GraphQL errors and HTTP failures never become empty successful data', async () => {
  await assert.rejects(graphQuery('https://example.com', '{}', {}, async()=>Response.json({errors:[{message:'private details'}]})), /GRAPH_QUERY_FAILED/);
  await assert.rejects(graphQuery('https://example.com', '{}', {}, async()=>new Response('',{status:429})), /GRAPH_HTTP_FAILED/);
  await assert.rejects(graphQuery('http://example.com','{}'), /HTTPS/);
});
test('pagination preserves all rows and rejects stalled order or truncation', async () => {
  let calls = 0;
  const rows = await pagedEvents(async ({after}) => { calls++; return {eventRecords: after === '0x' ? Array.from({length:500},(_,i)=>({id:'0x'+i.toString(16).padStart(8,'0')})) : [{id:'0xffffffff'}]}; }, {});
  assert.equal(rows.length,501); assert.equal(calls,2);
  await assert.rejects(pagedEvents(async()=>({eventRecords:[{id:'0x'}]}),{}), /ORDER/);
  await assert.rejects(pagedEvents(async({after})=>({eventRecords:Array.from({length:500},(_,i)=>({id:after+'a'+i.toString().padStart(3,'0')}))}),{}), /LIMIT/);
});
test('approval owner/spender remain distinct; provider-only metadata is discarded', () => {
  const row={owner:GOVERNOR,spender:MANA,value:'5'};
  assert.deepEqual(comparableEvent({...row,providerDetail:'ignored'}),comparableEvent(row));
  assert.notDeepEqual(comparableEvent(row),comparableEvent({...row,owner:MANA,spender:GOVERNOR}));
});
