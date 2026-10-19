import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('production recovery configuration initializes the installed Browser Use SDK without network or Chrome',async()=>{
 const script=`
import asyncio, importlib.util, json
spec = importlib.util.spec_from_file_location('recovery', 'python/recover.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
async def verify():
    browser = m.Browser(cdp_url='http://127.0.0.1:1', keep_alive=True, use_cloud=False)
    for goal in [None, {'partNumber': 'S1-33101975102'}]:
        request = {'goal': goal, 'model': 'qwen3:4b', 'host': 'http://127.0.0.1:1', 'timeout': 5, 'context': 8192}
        agent = m.create_agent(request, browser, m.Tools(exclude_actions=['search']), 'Read-only SDK constructor regression', None)
        assert agent.settings.max_history_items == 6
        assert agent.settings.max_actions_per_step == 1
        assert agent.settings.use_vision is False
        assert agent.settings.flash_mode is bool(goal)
    print('SDK_CONSTRUCTOR_OK')
asyncio.run(verify())
`;
 const {stdout}=await promisify(execFile)('.venv/bin/python',['-c',script],{timeout:15000,env:{...process.env,ANONYMIZED_TELEMETRY:'false',BROWSER_USE_CLOUD:'false'}});
 assert.match(stdout,/SDK_CONSTRUCTOR_OK/);
});

test('bounded post-model inspection verifies remaining observed candidates without repeats or exceeding the visit budget',async()=>{
 const script=`
import asyncio, importlib.util
spec = importlib.util.spec_from_file_location('recovery', 'python/recover.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
async def check(visited, target, budget, expected, matched=False):
    async def verified():
        return matched
    async def inspect(index):
        nonlocal matched
        assert index not in visited
        visited.append(index)
        matched = index == target
    actual = await m.complete_observed_candidates({'maxSteps': budget}, {'candidates': [0,1,2,3,4]}, visited, verified, inspect)
    assert actual == expected, (actual, expected)
async def verify():
    await check([0,1], 2, 4, [2])
    await check([0], 4, 3, [1,2])
    await check([0,1,2,3], 4, 4, [])
    await check([], 2, 4, [])
    await check([2], 2, 4, [], True)
    await check([0,1,2,3], 99, 5, [4])
    print('BOUNDED_INSPECTION_OK')
asyncio.run(verify())
`;
 const {stdout}=await promisify(execFile)('.venv/bin/python',['-c',script],{timeout:15000,env:{...process.env,ANONYMIZED_TELEMETRY:'false',BROWSER_USE_CLOUD:'false'}});
 assert.match(stdout,/BOUNDED_INSPECTION_OK/);
});

test('startup failures disconnect the recovery browser before the error returns',async()=>{
 const script=`
import asyncio, importlib.util, io, json
spec = importlib.util.spec_from_file_location('recovery', 'python/recover.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class BrowserProbe:
    stopped = False
    async def stop(self):
        self.stopped = True
probe = BrowserProbe()
m.Browser = lambda **kwargs: probe
async def fail_during_setup(request, browser):
    raise RuntimeError('constructor regression probe')
m.execute = fail_during_setup
m.sys.stdin = io.StringIO(json.dumps({'cdpUrl': 'http://127.0.0.1:1', 'domains': ['supplier.invalid']}))
try:
    asyncio.run(m.main())
except RuntimeError as error:
    assert str(error) == 'constructor regression probe'
else:
    raise AssertionError('startup failure swallowed')
assert probe.stopped
print('STARTUP_CLEANUP_OK')
`;
 const {stdout}=await promisify(execFile)('.venv/bin/python',['-c',script],{timeout:15000,env:{...process.env,ANONYMIZED_TELEMETRY:'false',BROWSER_USE_CLOUD:'false'}});
 assert.match(stdout,/STARTUP_CLEANUP_OK/);
});
