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
        ['check', ['helm', check, `${apply  } --dry-run=server`]],
        ['check-adoption', ['helm', check, `${adopt  } --dry-run=server`]],
        ['apply', ['helm', check, `${apply  } --dry-run=server`, apply, ...wait, 'afterReady']],
        ['adopt', ['helm', check, `${adopt  } --dry-run=server`, adopt, ...wait, 'afterReady']]
    ]) {
        it(`performs only the requested operations for ${  action}`, () => {
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
        it(`stops on a failed ${  failOn  } without follow-up mutations`, () => {
            const calls = [];
            assert.throws(() => { executeRelease(release(), 'apply', record(calls, failOn)); }, /unavailable/u);
            assert(calls.at(-1).includes(failOn));
        });
    }

    for (const key of ['context', 'namespace', 'fieldManager']) {
        it(`rejects an empty ${  key  } before a cluster operation`, () => {
            const plan = { ...release(), [key]: '' };
            assert.throws(() => { executeRelease(plan, 'apply', assert.fail); }, new RegExp(key, 'u'));
        });
    }
});
