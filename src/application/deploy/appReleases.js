/**
 * Values a profile app passes to its own chart.
 *
 * An app that already carries chart values keeps them. Otherwise the
 * image, node port, and url are the values.
 *
 * @param {object} app - profile app
 * @returns {object} chart values
 * @example
 *   valuesOf({ image: 'example.invalid/hmi:1', name: 'frontend', nodePort: 30080 });
 */
function valuesOf(app) {
    if (app.values) {
        return { ...app.values };
    }
    const values = {};
    if (app.image) {
        values.image = app.image;
    }
    if (app.nodePort) {
        values.nodePort = app.nodePort;
    }
    if (app.url) {
        values.url = app.url;
    }
    return values;
}

/**
 * Helm releases for profile apps beside scada.
 *
 * The scada chart does not draw these. Each app is installed by its own
 * chart into the same cluster.
 *
 * @example
 *   appReleases([{ image: 'example.invalid/hmi:1', name: 'frontend' }], 'cell-a');
 *
 * @param {object[]} apps - releases().apps
 * @param {string} cluster - release cluster
 * @returns {object[]} chart releases
 */
export default function appReleases(apps, cluster) {
    return (apps || []).map((app) => {
        return {
            chart: app.chart || app.name,
            name: `${cluster}-${app.name}`,
            values: valuesOf(app)
        };
    });
}
