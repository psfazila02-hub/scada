/** Resolve references only at resource construction; hashes and manifests retain refs. */
export default function resolveSecrets(value, secrets) {
    if (Array.isArray(value)) { return value.map((item) => { return resolveSecrets(item, secrets); }); }
    if (!value || typeof value !== 'object') { return value; }
    if (Object.hasOwn(value, '$secret')) {
        if (Object.keys(value).length !== 1 || typeof value.$secret !== 'string') { throw new TypeError('Invalid secret reference'); }
        const resolved = secrets?.get(value.$secret);
        if (resolved === undefined || resolved === null) { throw new Error('Required collector secret is unavailable'); }
        return resolved;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => { return [key, resolveSecrets(item, secrets)]; }));
}
