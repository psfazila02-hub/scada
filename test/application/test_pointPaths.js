import assert from 'node:assert';
import pointPaths from '../../src/application/deploy/pointPaths.js';

describe('pointPaths', function() {
    it('names a mapped point by the document path', function() {
        const stem = `mill/ünit-${Math.random().toString(36).slice(2, 6)}/electrical`;
        const channel = `holding:${4000 + Math.floor(Math.random() * 12)}:cdab`;
        assert.strictEqual(
            pointPaths(stem, { voltage: channel })[channel],
            `${stem}/voltage`,
            'pointPaths left the voltage point on a device channel'
        );
    });
});
