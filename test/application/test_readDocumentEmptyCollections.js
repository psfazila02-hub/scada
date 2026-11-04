import assert from 'node:assert/strict';
import readDocument from '../../src/application/deploy/readDocument.js';

describe('readDocument empty collections', () => {
    it('parses empty lists and maps as collection values', () => {
        assert.deepEqual(readDocument('collectorTasks: []\noptions: {}'), { collectorTasks: [], options: {} });
    });
    it('parses empty collections in lists', () => {
        assert.deepEqual(readDocument('values:\n  - []\n  - {}'), { values: [[], {}] });
    });
    it('preserves quoted empty collection text', () => {
        assert.deepEqual(readDocument('list: "[]"\nmap: "{}"'), { list: '[]', map: '{}' });
    });
});
