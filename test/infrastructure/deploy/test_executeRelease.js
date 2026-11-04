import assert from 'node:assert/strict';
import executeRelease from '../../../src/infrastructure/deploy/executeRelease.js';

function release() {
    return { context: 'lab', namespace: 'devices', chart: '/charts/sample', release: 'line',
        values: { sample: true }, fieldManager: 'device-release',
        prerequisites: ['secret/registry'], workloads: ['statefulset/bus', 'deployment/reader'] };
}

function record(calls, failOn) {
    return (command, args, options) => {
        if (command === 'helm') {
            assert.deepEqual(args, ['template', 'line', '/charts/sample', '--namespace', 'devices', '-f', '-']);
            assert.deepEqual(JSON.parse(options.input), { sample: true });
            calls.push('helm');
            return 'manifests';
        }
        assert.equal(command, 'kubectl');
        assert.deepEqual(args.slice(0, 4), ['--context', 'lab', '--namespace', 'devices']);
        if (['diff', 'apply'].includes(args[4])) { assert.equal(options.input, 'manifests'); }
        calls.push(args.slice(4).join(' '));
        if (args.includes(failOn)) { throw new Error('unavailable'); }
        return '';
    };
}

describe('executeRelease', () => {
    const check = 'get secret/registry -o name';
    const apply = 'apply --server-side --field-manager=device-release -f -';
    const adopt = 'apply --field-manager=kubectl-client-side-apply -f -';
    const wait = ['rollout status statefulset/bus --timeout=300s', 'rollout status deployment/reader --timeout=300s'];
    for (const [action, expected] of [
        ['render', ['helm']],
        ['diff', ['helm', check, 'diff --server-side --field-manager=device-release -f -']],
        ['check', ['helm', check, `${apply} --dry-run=server`]],
        ['check-adoption', ['helm', check, `${adopt} --dry-run=server`]],
        ['apply', ['helm', check, `${apply} --dry-run=server`, apply, ...wait, 'afterReady']],
        ['adopt', ['helm', check, `${adopt} --dry-run=server`, adopt,
            `${apply} --dry-run=server`, apply, ...wait, 'afterReady']]
    ]) {
        it(`performs only the requested operations for ${action}`, () => {
            const calls = [];
            const plan = { ...release(), afterReady(current, kube) {
                assert.equal(current.context, 'lab');
                kube(['afterReady']);
            } };
            const result = executeRelease(plan, action, record(calls));
            assert.equal(result, action === 'render' ? 'manifests' : '');
            assert.deepEqual(calls, expected);
        });
    }

    for (const failOn of ['secret/registry', '--dry-run=server', 'statefulset/bus']) {
        it(`stops on a failed ${failOn} without follow-up mutations`, () => {
            const calls = [];
            assert.throws(() => { executeRelease(release(), 'apply', record(calls, failOn)); }, /unavailable/u);
            assert(calls.at(-1).includes(failOn));
        });
    }

    it('stops adoption if another manager changes a field after the SSA dry-run', () => {
        const calls = [];
        const run = record(calls);
        assert.throws(() => {
            executeRelease(release(), 'adopt', (command, args, options) => {
                const output = run(command, args, options);
                if (args.includes('--server-side') && !args.includes('--dry-run=server')) {
                    throw new Error('field ownership conflict');
                }
                return output;
            });
        }, /ownership conflict/u);
        assert.deepEqual(calls, ['helm', check, `${adopt} --dry-run=server`, adopt, `${apply} --dry-run=server`, apply]);
    });

    for (const key of ['context', 'namespace', 'fieldManager']) {
        it(`rejects an empty ${key} before a cluster operation`, () => {
            const plan = { ...release(), [key]: '' };
            assert.throws(() => { executeRelease(plan, 'apply', assert.fail); }, new RegExp(key, 'u'));
        });
    }
});

function retiring() {
    return { ...release(), retirements: ['old-one', 'old-two'].map((name) => {
        return { workload: `deployment/edge-${name}`, selector: `app=${name}` };
    }) };
}

function retirementRun(calls, { absent = false, pods = '', failure } = {}) {
    const run = record(calls, failure);
    return (command, args, options) => {
        const result = run(command, args, options);
        if (args.includes('--ignore-not-found')) {
            assert.equal(options.stdio[1], 'pipe');
            return absent ? '' : 'deployment.apps/old\n';
        }
        if (args.includes('pods')) {
            assert.equal(options.stdio[1], 'pipe');
            return pods;
        }
        return result;
    };
}

describe('executeRelease retirement', () => {
    for (const action of ['apply', 'adopt']) {
        it(`retires both old deployments and verifies their pods before ${action}`, () => {
            const calls = [];
            executeRelease(retiring(), action, retirementRun(calls));
            const firstDelete = calls.findIndex((call) => { return call.startsWith('delete '); });
            const firstWrite = calls.findIndex((call) => { return call.startsWith('apply ') && !call.includes('dry-run'); });
            assert(firstDelete > 0);
            assert(calls.slice(0, firstDelete).some((call) => { return call.includes('--server-side') && call.includes('dry-run'); }));
            if (action === 'adopt') {
                assert(calls.slice(0, firstDelete).some((call) => { return call.includes('kubectl-client-side-apply') && call.includes('dry-run'); }));
            }
            for (const name of ['old-one', 'old-two']) {
                const expected = [`get deployment/edge-${name} --ignore-not-found -o name`,
                    `delete deployment/edge-${name} --cascade=foreground --wait=true --timeout=300s`,
                    `get pods -l app=${name} -o name`];
                const offset = calls.indexOf(expected[0]);
                assert.deepEqual(calls.slice(offset, offset + 3), expected);
                assert(offset + 2 < firstWrite);
            }
        });
        for (const absent of [true, false]) {
            it(`blocks ${action} writes when old pods remain (absent=${absent})`, () => {
                const calls = [];
                assert.throws(() => { return executeRelease(retiring(), action,
                    retirementRun(calls, { absent, pods: 'pod/old-terminating\n' })); }, /pods remain/u);
                assert(!calls.some((call) => { return call.startsWith('apply ') && !call.includes('dry-run'); }));
            });
        }
        it(`allows an idempotent ${action} retry after both deployments disappeared`, () => {
            const calls = [];
            executeRelease(retiring(), action, retirementRun(calls, { absent: true }));
            assert.equal(calls.filter((call) => { return call.startsWith('get pods '); }).length, 2);
            assert(!calls.some((call) => { return call.startsWith('delete '); }));
        });
        for (const failure of ['--dry-run=server', 'secret/registry']) {
            it(`does not retire on ${action} preflight failure ${failure}`, () => {
                const calls = [];
                assert.throws(() => { return executeRelease(retiring(), action, retirementRun(calls, { failure })); }, /unavailable/u);
                assert(!calls.some((call) => { return call.startsWith('delete '); }));
            });
        }
    }
    it('does not delete or write when adoption SSA preflight fails after CSA preflight passes', () => {
        const calls = [];
        assert.throws(() => {
            executeRelease(retiring(), 'adopt', retirementRun(calls, { failure: '--server-side' }));
        }, /unavailable/u);
        assert(!calls.some((call) => { return call.startsWith('delete ') || (call.startsWith('apply ') && !call.includes('dry-run')); }));
    });
    for (const action of ['render', 'check', 'check-adoption', 'diff']) {
        it(`does not retire during ${action}`, () => {
            const calls = [];
            executeRelease(retiring(), action, retirementRun(calls));
            assert(!calls.some((call) => { return /^(?:delete|get pods|get deployment)/u.test(call); }));
        });
    }
    for (const retirement of [
        { workload: 'deployment/reader', selector: 'app=reader' },
        { workload: 'deployment/old-one --all', selector: 'app=old-one' },
        { workload: 'statefulset/old-one', selector: 'app=old-one' },
        { workload: 'deployment/old-one', selector: '' },
        { workload: 'deployment/old-one', selector: 'app=old-one,other=wide' }
    ]) {
        it(`rejects unsafe retirement ${JSON.stringify(retirement)} before commands`, () => {
            assert.throws(() => { return executeRelease({ ...release(), retirements: [retirement] }, 'apply', assert.fail); }, /retirement/u);
        });
    }
});
