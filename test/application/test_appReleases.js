import assert from 'node:assert';
import appReleases from '../../src/application/deploy/appReleases.js';

describe('appReleases', function() {
    it('names a profile app by cluster and chart', function() {
        const cluster = `edge-${Math.random().toString(36).slice(2, 6)}`;
        const image = `example.invalid/hmi:${Math.random().toString(36).slice(2, 6)}`;
        const port = 30080 + Math.floor(Math.random() * 10);
        assert.deepStrictEqual(
            appReleases([{ image, name: 'frontend', nodePort: port }], cluster),
            [{
                chart: 'frontend',
                name: `${cluster}-frontend`,
                values: { image, nodePort: port }
            }],
            'appReleases did not name the profile app release'
        );
    });

    it('keeps values a profile app already carries', function() {
        const cluster = `cell-${Math.random().toString(36).slice(2, 6)}`;
        const image = `example.invalid/book:${Math.random().toString(36).slice(2, 6)}`;
        const book = appReleases([{
            chart: 'wms',
            name: 'wms',
            values: { image, secret: 'wms-postgres' }
        }], cluster)[0];
        assert.deepStrictEqual(
            book.values,
            { image, secret: 'wms-postgres' },
            'appReleases rebuilt values the app already carried'
        );
    });
});
