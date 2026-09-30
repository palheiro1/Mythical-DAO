import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('event ABIs explicitly declare anonymous and indexed for Graph Node deserialization',()=>{
  for(const name of ['Governor','MANA']) {
    const abi=JSON.parse(readFileSync(new URL(`../abis/${name}.json`,import.meta.url)));
    assert.equal(abi.length,4);
    for(const event of abi){
      assert.equal(event.type,'event');assert.equal(event.anonymous,false);
      for(const input of event.inputs) assert.equal(typeof input.indexed,'boolean');
    }
  }
});
