import mergeDocuments from './mergeDocuments.js';

/**
 * Loads `include` entries, then overlays the rest of the document.
 *
 * @param {object} parsed - one parsed file
 * @param {Function|undefined} load - file reader
 * @param {string[]} stack - includes already being read
 * @param {Function} read - document reader
 * @returns {object} combined document
 * @example
 *   applyIncludes({ include: ['maps.yaml'] }, () => { return 'mappings: {}\n'; }, [], readDocument);
 */
export default function applyIncludes(parsed, load, stack, read) {
    if (!Object.hasOwn(parsed, 'include')) {
        return parsed;
    }
    if (typeof load !== 'function') {
        throw new Error('system document include needs a reader');
    }
    const listed = Array.isArray(parsed.include) ? parsed.include : [parsed.include];
    const rest = { ...parsed };
    delete rest.include;
    const catalog = listed.reduce((acc, name) => {
        if (stack.includes(name)) {
            throw new Error(`system document include cycles ${name}`);
        }
        return mergeDocuments(acc, read(load(name), load, stack.concat(name)));
    }, {});
    return mergeDocuments(catalog, rest);
}
