/**
 * Reports whether a value is a plain map.
 *
 * @param {*} value - candidate
 * @returns {boolean} true for a non-null object that is not an array
 * @example
 *   isMap({ id: 'cell' });
 */
function isMap(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep-merges two maps. A null value removes that key.
 *
 * @param {object|undefined} left - base map
 * @param {object|undefined} right - overlay
 * @returns {object} merged map
 * @example
 *   mergeMaps({ secret: 'pg' }, { image: 'plant:1' });
 */
function mergeMaps(left, right) {
    const value = { ...(left || {}) };
    Object.keys(right || {}).forEach((key) => {
        const next = right[key];
        if (next === null) {
            delete value[key];
            return;
        }
        if (isMap(value[key]) && isMap(next)) {
            value[key] = mergeMaps(value[key], next);
            return;
        }
        value[key] = next;
    });
    return value;
}

/**
 * Overlays one system document on another.
 *
 * Listed top-level keys replace. `profiles` deep-merges. A `null` app
 * drops that app. Omitted keys stay from the catalog.
 *
 * @param {object} base - catalog document
 * @param {object} extra - contour overlay
 * @returns {object} combined document
 * @example
 *   mergeDocuments({ servers: [{ id: 'cell' }] }, { servers: [{ id: 'lab' }] });
 */
export default function mergeDocuments(base, extra) {
    const document = { ...base, ...extra };
    if (base.profiles || extra.profiles) {
        document.profiles = mergeMaps(base.profiles, extra.profiles);
    }
    return document;
}
