import { assertHeld, edgesOf } from './releaseEdges.js';
import { serverById } from './releaseNodes.js';

/**
 * Lists directed stream subscriptions for a source server in an expanded document.
 * A receiver may explicitly select a service. A sender-only declaration has none.
 */
export default function subscriptions(document, sourceId) {
    serverById(document, sourceId);
    const edges = edgesOf(document);
    assertHeld(document, edges);
    const rows = [];
    for (const { from, to, streams } of edges.filter((edge) => { return edge.from === sourceId; })) {
        for (const [name, services] of streams) {
            if (!services.size) { rows.push({ from, to, name }); }
            services.forEach((api) => { rows.push({ from, to, name, api }); });
        }
    }
    return rows;
}
