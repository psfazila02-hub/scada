/**
 * Numeric query parameter on a device address.
 *
 * @param {URL} url - device address
 * @param {string} key - query key
 * @returns {number|undefined} parsed value
 */
function queryNumber(url, key) {
    const text = url.searchParams.get(key);
    if (text === null) {
        return undefined;
    }
    const value = parseInt(text, 10);
    if (Number.isNaN(value) || value < 0) {
        throw new Error(`Address ${key} must be a non-negative number, got: ${text}`);
    }
    return value;
}

/**
 * Modbus TCP spec from a modbus URL.
 *
 * @param {string} name - device name
 * @param {URL} url - device address
 * @returns {string} name:host:port
 */
function tcpSpec(name, url) {
    const port = parseInt(url.port, 10);
    if (url.hostname.length === 0 || Number.isNaN(port) || port <= 0) {
        throw new Error(`Modbus address must be modbus://host:port, got: ${url.href}`);
    }
    return `${name}:${url.hostname}:${port}`;
}

/**
 * Modbus RTU spec from an rtu URL.
 *
 * @param {string} name - device name
 * @param {URL} url - device address
 * @returns {string} name:rtu:path:baud:line:slave
 */
function rtuSpec(name, url) {
    const parts = url.pathname.split(':');
    const path = parts[0];
    const baud = parseInt(parts[1], 10);
    const line = parts[2] || '8N1';
    const slave = parts[3] || '1';
    if (!path.startsWith('/dev/') || Number.isNaN(baud) || baud <= 0) {
        throw new Error(`RTU address must be rtu:///dev/ttyX:baud:line:slave, got: ${url.href}`);
    }
    return `${name}:rtu:${path}:${baud}:${line}:${slave}`;
}

/**
 * Connection spec and optional register window for one device URL.
 *
 * TCP addresses are `modbus://host:port`. RTU addresses are
 * `rtu:///dev/ttyX:baud:line:slave`. `at` and `count` are the poll window.
 *
 * @example
 *   addressWindow('modbus://192.0.2.11:502?at=4000&count=2', 'bay/voltage');
 *
 * @param {string} address - device URL
 * @param {string} name - device name in the modbus spec
 * @returns {{address: number|undefined, count: number|undefined, spec: string}} connection
 */
export default function addressWindow(address, name) {
    const url = new URL(address);
    const spec = url.protocol === 'modbus:' ? tcpSpec(name, url) : '';
    const serial = url.protocol === 'rtu:' ? rtuSpec(name, url) : spec;
    if (serial.length === 0) {
        throw new Error(`Device address scheme must be modbus or rtu, got: ${address}`);
    }
    return Object.freeze({
        address: queryNumber(url, 'at'),
        count: queryNumber(url, 'count'),
        spec: serial
    });
}
