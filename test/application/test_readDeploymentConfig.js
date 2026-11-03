import assert from 'node:assert/strict';
import { readDeploymentConfig } from '../../src/application/supervisorSink.js';

describe('readDeploymentConfig', function() {
    it('reads a bounded STOMP window and opt-in dead lettering', function() {
        const config = readDeploymentConfig({ STOMP_PREFETCH: '128', SEGMENTS_DEAD_LETTER_ENABLED: 'true' });
        assert.equal(config.pipeline.prefetch, 128);
        assert.equal(config.pipeline.deadLetter, true);
        assert.throws(() => {return readDeploymentConfig({ STOMP_PREFETCH: '0' })}, /STOMP_PREFETCH/u);
    });

    it('keeps the segment pipelines when SINK_PIPELINES is absent', function() {
        const broker = `stomp://broker-${Math.random().toString(36).slice(2)}:61613`;
        assert.equal(
            readDeploymentConfig({ STOMP_URL: broker }).pipelines,
            true,
            'absent SINK_PIPELINES disabled the segment pipelines'
        );
    });

    it('stops the segment pipelines when SINK_PIPELINES is false', function() {
        const broker = `stomp://broker-${Math.random().toString(36).slice(2)}:61613`;
        assert.equal(
            readDeploymentConfig({ STOMP_URL: broker, SINK_PIPELINES: 'false' }).pipelines,
            false,
            'SINK_PIPELINES=false left the segment pipelines enabled'
        );
    });
});
