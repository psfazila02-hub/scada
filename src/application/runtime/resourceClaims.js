/** Exclusive resource claims remain held when cleanup cannot be proved. */
export default function resourceClaims() {
    const claims = new Map();
    return {
        check(taskId, resources) {
            if (!Array.isArray(resources) || resources.some((key) => { return typeof key !== 'string' || !key; })) {
                throw new TypeError('Invalid task resources');
            }
            resources.forEach((key) => {
                if (claims.has(key) && claims.get(key) !== taskId) { throw new Error(`Resource already claimed: ${key}`); }
            });
        },
        acquire(taskId, resources) {
            this.check(taskId, resources);
            resources.forEach((key) => { claims.set(key, taskId); });
        },
        release(taskId) {
            claims.forEach((owner, key) => { if (owner === taskId) { claims.delete(key); } });
        }
    };
}
