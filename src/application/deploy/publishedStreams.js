import { assertLeaf } from './expandDevices.js';
import { picked } from './expandPattern.js';

/** Resolve each API's published stream names, preserving its opaque contract metadata. */
export function expandApis(apis, paths, objects) {
    return apis?.map((api) => {
        if (!api.publishes) { return api; }
        const publishes = api.publishes.flatMap((entry) => {
            return picked(entry.name, paths, 'path', true).map((name) => {
                assertLeaf(objects, name);
                return { ...entry, name };
            });
        });
        return { ...api, publishes };
    });
}

/** Streams made available by publishers on the selected service. */
export function publishedNames(server, api) {
    return (server.api || []).filter((item) => {
        return !api || item.id === api;
    }).flatMap((item) => {
        return (item.publishes || []).map(({ name }) => { return name; });
    });
}

/** Locally collected and forwarded streams stay available through the server's services. */
export function availableNames(source, api) {
    return [...new Set([...source.fanIn.map(({ name }) => { return name; }), ...publishedNames(source, api)])];
}
