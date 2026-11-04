function validate(value, seen, depth) {
    if (depth > 128) { throw new TypeError('Task state JSON is too deeply nested'); }
    if (value === null || typeof value !== 'object') { return; }
    if (seen.has(value)) { throw new TypeError('Task state JSON must not contain cycles'); }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        throw new TypeError('Task state requires JSON data; encode binary as a string explicitly');
    }
    if (!(Array.isArray(value) || value instanceof Date || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
        throw new TypeError('Task state requires plain JSON data');
    }
    seen.add(value);
    Object.values(value).forEach((item) => { validate(item, seen, depth + 1); });
    seen.delete(value);
}
/** Normalize before first delivery so recovered PostgreSQL JSON has identical types. */
export default function stateDocument(value, maxBytes) {
    validate(value, new Set(), 0);
    const text = JSON.stringify(value);
    if (typeof text !== 'string') { throw new TypeError('Task state requires JSON data'); }
    if (Buffer.byteLength(text) > maxBytes) { throw new Error('Task state capacity exceeded'); }
    return JSON.parse(text);
}
