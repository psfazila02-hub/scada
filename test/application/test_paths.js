import assert from 'node:assert';
import paths from '../../src/application/deploy/paths.js';

describe('paths', function() {
    it('lists a nested namespace id', function() {
        const id = `m${Math.random().toString(36).slice(2, 8)}`;
        assert.deepStrictEqual(
            paths({
                namespace: [{ id: 'mill', nodes: [{ id }] }]
            }),
            ['mill', `mill/${id}`],
            'paths dropped the nested namespace id'
        );
    });

    it('expands a template onto a node', function() {
        const child = `v${Math.random().toString(36).slice(2, 6)}`;
        assert.deepStrictEqual(
            paths({
                namespace: [{ id: 'unit', template: 'furnace' }],
                templates: { furnace: [{ id: child }] }
            }),
            ['unit', `unit/${child}`],
            'paths left a template unexpanded'
        );
    });

    it('adds a patch id the template does not have', function() {
        const extra = `r${Math.random().toString(36).slice(2, 6)}`;
        const listed = paths({
            namespace: [{
                id: 'unit',
                nodes: [{ id: extra }],
                template: 'furnace'
            }],
            templates: { furnace: [{ id: 'voltage' }] }
        });
        assert.strictEqual(
            listed.includes(`unit/${extra}`),
            true,
            'paths dropped a patched namespace id'
        );
    });
});
