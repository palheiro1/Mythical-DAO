import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deploymentOptions} from '../scripts/deploy-studio.mjs';
const env={GRAPH_STUDIO_CREATED:'mythical-dao-pilot',GRAPH_DEPLOY_KEY:'local-fake-key-for-testing-only'};
test('project key overrides global auth and never enters ordinary CLI arguments',()=>{
  const result=deploymentOptions(env,'global-fake-key-for-testing-only');
  assert.equal(result.key,env.GRAPH_DEPLOY_KEY);
  assert.ok(!result.args.includes(result.key));
  assert.deepEqual(result.args,['mythical-dao-pilot','--node','https://api.studio.thegraph.com/deploy/','--version-label','v0.1.0']);
});
test('requires dedicated slug, valid version and a credential before deployment',()=>{
  assert.throws(()=>deploymentOptions({...env,GRAPH_STUDIO_CREATED:'another-project'}));
  assert.throws(()=>deploymentOptions({...env,GRAPH_VERSION:'--publish'}));
  assert.throws(()=>deploymentOptions({...env,GRAPH_DEPLOY_KEY:''}));
  assert.equal(deploymentOptions({...env,GRAPH_DEPLOY_KEY:''},'global-fake-key-for-testing-only').key,'global-fake-key-for-testing-only');
});
