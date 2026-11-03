/**
 * Overlays a child profile on its parent.
 *
 * The child keeps the parent's modules, command, variables, and apps.
 * A child app id replaces that one app. A child command replaces the command.
 *
 * @param {object} parent - resolved parent profile
 * @param {object} child - extending profile
 * @returns {object} merged profile
 * @example
 *   overlay({ command: ['node'] }, { extends: 'cell' });
 */
function overlay(parent, child) {
    const merged = {
        ...parent,
        ...child,
        apps: { ...(parent.apps || {}), ...(child.apps || {}) },
        modules: { ...(parent.modules || {}), ...(child.modules || {}) },
        variables: { ...(parent.variables || {}), ...(child.variables || {}) }
    };
    delete merged.extends;
    return merged;
}

/**
 * Resolves one profile, following `extends`.
 *
 * @param {string} name - profile id
 * @param {object} profiles - declared profiles
 * @param {object} done - profiles already resolved
 * @param {string[]} stack - profiles on the current chain
 * @returns {object} resolved profile
 * @example
 *   resolve('cell', { cell: {} }, {}, []);
 */
function resolve(name, profiles, done, stack) {
    if (Object.hasOwn(done, name)) {
        return done[name];
    }
    const profile = profiles[name];
    if (!profile) {
        throw new Error(`system document has no profile ${name}`);
    }
    if (stack.includes(name)) {
        throw new Error(`system document profile ${name} extends itself`);
    }
    if (!profile.extends) {
        done[name] = { ...profile };
        return done[name];
    }
    const parent = resolve(profile.extends, profiles, done, stack.concat(name));
    done[name] = overlay(parent, profile);
    return done[name];
}

/**
 * Merges every profile with the profile it extends.
 *
 * @param {object} profiles - declared profiles
 * @returns {object} profiles with `extends` applied
 * @example
 *   expandProfiles({ cell: {}, external: { extends: 'cell' } });
 */
export function expandProfiles(profiles) {
    const done = {};
    Object.keys(profiles).forEach((name) => {
        resolve(name, profiles, done, []);
    });
    return done;
}
