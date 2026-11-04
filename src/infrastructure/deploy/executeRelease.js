import { execFileSync } from 'node:child_process';

/** Retire only explicit Deployments with a single exact app label selector. */
function validateRetirements(plan) {
    if (plan.retirements !== undefined && !Array.isArray(plan.retirements)) {
        throw new Error('retirements must be an array');
    }
    for (const retirement of plan.retirements || []) {
        const name = retirement?.workload?.match(/^deployment\/(?<name>[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/u)?.groups.name;
        const label = retirement?.selector?.match(/^app=(?<label>[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?)$/u)?.groups.label;
        if (!name || name.length > 253 || name.split('.').some((part) => { return !part || part.length > 63; })
            || !label || label.length > 63 || (plan.workloads || []).includes(retirement.workload)) {
            throw new Error('retirement requires an exact old deployment and app label outside desired workloads');
        }
    }
}

/** Validates the target before helm or kubectl can fall back to a default. */
function validate(plan, action) {
    if (!['render', 'check', 'diff', 'apply', 'adopt', 'check-adoption'].includes(action)) {
        throw new Error('action must be render, check, diff or apply (adopt/check-adoption for migration)');
    }
    const fields = action === 'render' ? ['chart', 'release', 'namespace'] : ['chart', 'release', 'namespace', 'context', 'fieldManager'];
    validateRetirements(plan);
    fields.forEach((key) => {
        if (typeof plan[key] !== 'string' || !plan[key].trim()) { throw new Error(`release requires ${key}`); }
    });
}

/** Every Kubernetes command, including the post-rollout hook, shares this target. */
function kubeAt(plan, execute) {
    return (args, input, capture = false) => {
        return execute('kubectl', ['--context', plan.context, '--namespace', plan.namespace, ...args],
            { input, encoding: 'utf8', stdio: ['pipe', capture ? 'pipe' : 'inherit', 'inherit'] });
    };
}

function applyWith(kube, manifests, flags, checkOnly) {
    const args = ['apply', ...flags, '-f', '-'];
    kube([...args, '--dry-run=server'], manifests);
    if (!checkOnly) { kube(args, manifests); }
}

/** A missing Deployment can still have terminating pods from an interrupted attempt. */
function retireWorkloads(plan, kube) {
    for (const { workload, selector } of plan.retirements || []) {
        if (kube(['get', workload, '--ignore-not-found', '-o', 'name'], undefined, true).trim()) {
            kube(['delete', workload, '--cascade=foreground', '--wait=true', '--timeout=300s']);
        }
        if (kube(['get', 'pods', '-l', selector, '-o', 'name'], undefined, true).trim()) {
            throw new Error(`retirement pods remain for ${workload} (${selector})`);
        }
    }
}

function preflightRetirements(plan, action, kube, manifests) {
    if (['apply', 'adopt'].includes(action) && plan.retirements?.length) {
        if (action === 'adopt') {
            applyWith(kube, manifests, ['--field-manager=kubectl-client-side-apply'], true);
        }
        applyWith(kube, manifests, ['--server-side', `--field-manager=${plan.fieldManager}`], true);
        retireWorkloads(plan, kube);
    }
}

/** Adopt legacy fields, then enforce the complete manifest before waiting for rollouts. */
function applyRelease(plan, action, kube, manifests) {
    preflightRetirements(plan, action, kube, manifests);
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
 * resource/name references. Optional retirements are { workload: "deployment/name",
 * selector: "app=label" }; callers bind these to the old declarative app. They are
 * removed after preflight and before any writes, with no selected pods remaining.
 * afterReady(plan, kube) runs after a successful apply.
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
