/**
 * Document path of each device point in a map.
 *
 * A point map key is the parameter. The published name is the flow path
 * plus that parameter. The device point stays the map value.
 *
 * @example
 *   pointPaths('mill/electrical', { voltage: 'holding:4000:cdab' });
 *
 * @param {string} name - flow path
 * @param {object} mapping - parameter id to device point
 * @returns {object} device point to document path
 */
export default function pointPaths(name, mapping) {
    const paths = {};
    Object.keys(mapping || {}).forEach((key) => {
        paths[String(mapping[key])] = `${name}/${key}`;
    });
    return paths;
}
