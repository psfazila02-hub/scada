import { createReadStream } from 'node:fs';
import assignment, { identity } from './assignment.js';

async function read(stream) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of stream) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 1048576) { throw new Error('Manifest capacity exceeded'); }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}
export async function readManifest(env, argv) {
    const text = env.COLLECTOR_MANIFEST ?? await read(argv[0] === '-' ? process.stdin : createReadStream(argv[0] ?? env.COLLECTOR_MANIFEST_PATH));
    if (Buffer.byteLength(text) > 1048576) { throw new Error('Manifest capacity exceeded'); }
    return JSON.parse(text);
}
export async function validateManifest(document, registry) {
    if (!document || !Array.isArray(document.assignments) || !Array.isArray(document.removals ?? [])) {
        throw new TypeError('Manifest requires assignments and optional removals arrays');
    }
    const ids = new Set();
    const resources = new Set();
    for (const input of [...document.assignments, ...(document.removals ?? [])]) {
        identity(input);
        if (ids.has(input.taskId)) { throw new TypeError('Duplicate manifest taskId'); }
        ids.add(input.taskId);
    }
    await Promise.all(document.assignments.map(async (input) => {
        const request = assignment(input, registry);
        await request.adapter.validate(request.spec);
        request.adapter.resources(request.spec).forEach((key) => {
            if (resources.has(key)) { throw new Error('Manifest resource already claimed'); }
            resources.add(key);
        });
    }));
}
