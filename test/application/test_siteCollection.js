import assert from 'node:assert/strict';
import { collectionEnvironment, startCollection } from '../../src/application/siteCollection.js';

describe('externally owned site collection', () => {
    it('does not launch an embedded source when identical executors own collection', () => {
        let starts = 0;
        const config = { collectorMode: 'external', env: { SINK_PIPELINES: 'true', POSTGRES_URL: 'postgres://test' } };
        startCollection(config, () => { starts += 1; });
        assert.equal(starts, 0);
        assert.equal(collectionEnvironment(config).SINK_PIPELINES, 'false');
        assert.equal(config.env.SINK_PIPELINES, 'true');
        assert.equal(collectionEnvironment(config).POSTGRES_URL, 'postgres://test');
    });
    it('preserves embedded startup by default and rejects a misspelled mode', () => {
        assert.equal(startCollection({ env: {} }, () => { return 'started'; }), 'started');
        assert.throws(() => { collectionEnvironment({ collectorMode: 'externl' }); }, /collectorMode/u);
    });
});
