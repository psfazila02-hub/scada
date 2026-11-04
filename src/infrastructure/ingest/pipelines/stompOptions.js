/** Preserve driver defaults when an optional pipeline setting was omitted. */
export default function stompOptions(config, overrides = {}) {
    const options = { login: config.login, passcode: config.passcode, host: config.host,
        prefetch: config.prefetch, maxMessageBytes: config.maxMessageBytes,
        maxPendingBytes: config.maxPendingBytes, budget: config.budget, ...overrides };
    return Object.fromEntries(Object.entries(options).filter(([, value]) => { return value !== undefined; }));
}
