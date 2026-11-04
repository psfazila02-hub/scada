/** Bounds waiting; callers must also abort/close resources and fence late results. */
export default function deadline(action, milliseconds) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => { reject(new Error('Task operation timed out')); }, milliseconds);
    });
    return Promise.race([Promise.resolve().then(action), timeout]).finally(() => { clearTimeout(timer); });
}
