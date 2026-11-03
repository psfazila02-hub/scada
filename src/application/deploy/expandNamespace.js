/**
 * Rejects a patch that names one id twice.
 *
 * @param {object[]} patch - patch entries
 * @returns {void}
 * @example
 *   repeated([{ id: 'voltage' }]);
 */
function repeated(patch) {
    const ids = patch.map((entry) => {
        return entry.id;
    });
    ids.forEach((id, index) => {
        if (ids.indexOf(id) !== index) {
            throw new Error(`system document patch repeats ${id}`);
        }
    });
}

/**
 * Copies patch fields onto one staying node.
 *
 * @param {object} node - template node
 * @param {object} entry - patch entry
 * @param {object} templates - reusable node lists
 * @param {Function} apply - patch function
 * @param {Function} expand - node function
 * @returns {object} patched node
 * @example
 *   revise({ id: 'electrical' }, { id: 'electrical' }, {}, () => { return []; }, () => { return {}; });
 */
function revise(node, entry, templates, apply, expand) {
    const extra = {};
    Object.keys(entry).forEach((key) => {
        if (key !== 'enabled' && key !== 'id' && key !== 'nodes' && key !== 'template') {
            extra[key] = entry[key];
        }
    });
    const merged = { ...node, ...extra, id: node.id };
    if (entry.nodes) {
        merged.nodes = apply(node.nodes || [], entry.nodes, templates, expand);
    }
    if (!merged.nodes || merged.nodes.length === 0) {
        delete merged.nodes;
    }
    return merged;
}

/**
 * Applies one patch entry to an expanded child list.
 *
 * @param {object[]} current - children so far
 * @param {object} entry - one patch entry
 * @param {object} templates - reusable node lists
 * @param {Function} apply - patch function
 * @param {Function} expand - node function
 * @returns {object[]} next children
 * @example
 *   mergeOne([{ id: 'step' }], { enabled: false, id: 'step' }, {}, () => { return []; }, () => { return {}; });
 */
function mergeOne(current, entry, templates, apply, expand) {
    const index = current.findIndex((node) => {
        return node.id === entry.id;
    });
    if (index < 0) {
        if (entry.enabled === false) {
            return current;
        }
        return current.concat([expand(entry, templates)]);
    }
    if (entry.enabled === false) {
        return current.filter((node) => {
            return node.id !== entry.id;
        });
    }
    const next = current.slice();
    next[index] = revise(current[index], entry, templates, apply, expand);
    return next;
}

/**
 * Patches a template child list.
 *
 * An id the template lacks is added. An id the patch disables is removed.
 * A staying entry may patch those children the same way.
 *
 * @param {object[]} seeded - template children
 * @param {object[]} patch - node patch
 * @param {object} templates - reusable node lists
 * @param {Function} expand - node function
 * @returns {object[]} patched children
 * @example
 *   applyPatch([{ id: 'step' }], [{ enabled: false, id: 'step' }], {}, () => { return {}; });
 */
function applyPatch(seeded, patch, templates, expand) {
    repeated(patch);
    return patch.reduce((current, entry) => {
        return mergeOne(current, entry, templates, applyPatch, expand);
    }, seeded);
}

/**
 * Expands the children of one namespace node.
 *
 * @param {object} node - namespace node
 * @param {object} templates - reusable node lists
 * @param {Function} expand - node function
 * @returns {object[]} expanded children
 * @example
 *   childrenOf({ id: 'unit', template: 'unit' }, { unit: [] }, () => { return {}; });
 */
function childrenOf(node, templates, expand) {
    if (!node.template) {
        return (node.nodes || []).map((child) => {
            return expand(child, templates);
        });
    }
    const base = templates[node.template];
    if (!Array.isArray(base)) {
        throw new Error(`system document has no template ${node.template}`);
    }
    const seeded = base.map((child) => {
        return expand(child, templates);
    });
    return applyPatch(seeded, node.nodes || [], templates, expand);
}

/**
 * Expands one namespace node, applying its template and patch.
 *
 * @param {object} node - namespace node
 * @param {object} templates - reusable node lists
 * @returns {object} expanded node
 * @example
 *   expandNode({ id: 'mill' }, {});
 */
function expandNode(node, templates) {
    if (!node || typeof node.id !== 'string' || node.id.length === 0) {
        throw new Error('system document namespace id is empty');
    }
    const nodes = childrenOf(node, templates, expandNode);
    const copy = { id: node.id };
    Object.keys(node).forEach((key) => {
        if (key !== 'enabled' && key !== 'id' && key !== 'nodes' && key !== 'template') {
            copy[key] = node[key];
        }
    });
    if (nodes.length > 0) {
        copy.nodes = nodes;
    }
    return copy;
}

/**
 * Expands a namespace tree.
 *
 * @param {object[]|undefined} nodes - root nodes
 * @param {object} templates - reusable node lists
 * @returns {object[]} expanded roots
 * @example
 *   expandTree([{ id: 'mill' }], {});
 */
export function expandTree(nodes, templates) {
    return (nodes || []).map((node) => {
        return expandNode(node, templates);
    });
}

/**
 * Lists every node path from the root.
 *
 * @param {object[]|undefined} nodes - sibling nodes
 * @param {string} [prefix] - parent path
 * @returns {string[]} paths
 * @example
 *   treePaths([{ id: 'mill', nodes: [{ id: 'hall' }] }]);
 */
export function treePaths(nodes, prefix = '') {
    const found = [];
    (nodes || []).forEach((node) => {
        const path = prefix.length > 0 ? `${prefix}/${node.id}` : node.id;
        if (path.split('/').some((part) => {
            return part.length === 0;
        })) {
            throw new Error(`system document path ${path} has an empty segment`);
        }
        found.push(path);
        treePaths(node.nodes, path).forEach((child) => {
            found.push(child);
        });
    });
    return found;
}
