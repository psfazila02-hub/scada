/**
 * Deep-freezes a document value.
 *
 * @param {unknown} value - any JSON-like value
 * @returns {unknown} frozen value
 * @example
 *   frozen({ id: 'mill' });
 */
export default function frozen(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        return Object.freeze(value.map((item) => {
            return frozen(item);
        }));
    }
    const copy = {};
    Object.keys(value).forEach((key) => {
        copy[key] = frozen(value[key]);
    });
    return Object.freeze(copy);
}
