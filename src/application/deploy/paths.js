/**
 * Joins a child id onto a parent path.
 *
 * @param {string} prefix - parent path
 * @param {string} id - child id
 * @returns {string} path
 * @example
 *   joined('mill', 'unit');
 */
function joined(prefix, id) {
    if (prefix.length === 0) {
        return id;
    }
    return `${prefix}/${id}`;
}

/**
 * Patch entries the template does not already name.
 *
 * @param {object[]} base - template children
 * @param {object[]|undefined} patch - node patch
 * @returns {object[]} added nodes
 * @example
 *   extras([{ id: 'voltage' }], [{ id: 'rotation_on' }]);
 */
function extras(base, patch) {
    return (patch || []).filter((entry) => {
        return base.every((child) => {
            return child.id !== entry.id;
        });
    });
}

/**
 * Children of one namespace node, expanding its template.
 *
 * @param {object} node - namespace node
 * @param {object} templates - reusable node lists
 * @returns {object[]} children
 * @example
 *   children({ id: 'unit', template: 'furnace' }, { furnace: [] });
 */
function children(node, templates) {
    if (!node.template) {
        return node.nodes || [];
    }
    const base = templates[node.template];
    if (!Array.isArray(base)) {
        throw new Error(`system document has no template ${node.template}`);
    }
    return base.concat(extras(base, node.nodes));
}

/**
 * Walks a namespace and records every path.
 *
 * @param {object[]|undefined} nodes - sibling nodes
 * @param {string} prefix - parent path
 * @param {object} templates - reusable node lists
 * @param {string[]} found - accumulator
 * @returns {void}
 * @example
 *   walk([{ id: 'mill' }], '', {}, []);
 */
function walk(nodes, prefix, templates, found) {
    (nodes || []).forEach((node) => {
        const next = joined(prefix, node.id);
        found.push(next);
        walk(children(node, templates), next, templates, found);
    });
}

/**
 * Lists namespace paths, expanding templates and added patch ids.
 *
 * @example
 *   paths({ namespace: [{ id: 'mill' }], templates: {} });
 *
 * @param {object} document - system document
 * @returns {string[]} paths from the root
 */
export default function paths(document) {
    const found = [];
    walk(document.namespace, '', document.templates || {}, found);
    return found;
}
