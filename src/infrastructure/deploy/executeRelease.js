import { execFileSync } from 'node:child_process';

/** Validates the target before helm or kubectl can fall back to a default. */
function validate(plan, action) {
    if (!['render', 'check', 'diff', 'apply', 'adopt', 'check-adoption'].includes(action)) {
        throw new Error('action must be render, check, diff or apply (adopt/check-adoption for migration)');
    }
    const fields = action === 'render' ? ['chart', 'release', 'namespace'] : ['chart', 'release', 'namespace', 'context', 'fieldManager'];
    fields.forEach((key) => {
        if (typeof plan[key] !== 'string' || !plan[key].trim()) { throw new Error(`release requires ${key}`); }
    });
}

/** Every Kubernetes command, including the post-rollout hook, shares this target. */
function kubeAt(plan, execute) {
    return (args, input) => {
        return execute('kubectl', ['--context', plan.context, '--namespace', plan.namespace, ...args],
            { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
    };
}

function applyWith(kube, manifests, flags, checkOnly) {
    const args = ['apply', ...flags, '-f', '-'];
    kube([...args, '--dry-run=server'], manifests);
    if (!checkOnly) { kube(args, manifests); }
}

/** Adopt legacy fields, then enforce the complete manifest before waiting for rollouts. */
function applyRelease(plan, action, kube, manifests) {
    if (['adopt', 'check-adoption'].includes(action)) {
        applyWith(kube, manifests, ['--field-manager=kubectl-client-side-apply'], action === 'check-adoption');
        if (action === 'check-adoption') { return ''; }
    }
    applyWith(kube, manifests, ['--server-side', `--field-manager=${plan.fieldManager}`], action === 'check');
    if (action === 'check') { return ''; }
    for (const workload of plan.workloads || []) {
        kube(['rollout', 'status', workload, '--timeout=300s']);
    }
    plan.afterReady?.(plan, kube);
    return '';
}

/**
 * Renders a Helm release and executes the selected kubectl action synchronously.
 * Supply chart, release, namespace and values. Cluster actions additionally require
 * an explicit context and fieldManager. prerequisites and workloads are kubectl
 * resource/name references. afterReady(plan, kube) runs after a successful apply.
 */
export default function executeRelease(plan, action = 'render', execute = execFileSync) {
    validate(plan, action);
    const manifests = execute('helm', ['template', plan.release, plan.chart, '--namespace', plan.namespace, '-f', '-'],
        { input: JSON.stringify(plan.values), encoding: 'utf8' });
    if (action === 'render') { return manifests; }
    const kube = kubeAt(plan, execute);
    for (const resource of plan.prerequisites || []) { kube(['get', resource, '-o', 'name']); }
    if (action === 'diff') {
        return kube(['diff', '--server-side', `--field-manager=${plan.fieldManager}`, '-f', '-'], manifests);
    }
    return applyRelease(plan, action, kube, manifests);
}
