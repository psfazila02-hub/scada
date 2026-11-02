const orders = Object.freeze({
    abcd: 'abcd',
    cdab: 'cdab',
    uint16: 'uint16'
});

/**
 * Parses a holding-register point.
 *
 * `holding:<address>` is one uint16. `holding:<address>:abcd` and
 * `holding:<address>:cdab` are float32 word orders. The address is the
 * same PDU number as the poll window.
 *
 * @example
 *   parsePoint('holding:4000:cdab');
 *
 * @param {string} point - register point
 * @returns {{address: number, order: string, width: number}} parsed point
 */
export function parsePoint(point) {
    const parts = String(point).split(':');
    const address = parseInt(parts[1], 10);
    const order = parts[2] || orders.uint16;
    if (parts[0] !== 'holding' || Number.isNaN(address) || address < 0) {
        throw new Error(`Register point must be holding:<address>, got: ${point}`);
    }
    if (!Object.hasOwn(orders, order)) {
        throw new Error(`Register word order must be uint16, abcd, or cdab, got: ${point}`);
    }
    return Object.freeze({
        address,
        order,
        width: order === orders.uint16 ? 1 : 2
    });
}

/**
 * Float32 word order for a pair of uint16 registers.
 *
 * @param {string} order - abcd or cdab
 * @param {number} first - first register in the window
 * @param {number} second - second register in the window
 * @returns {number[]} high word then low word
 */
function placed(order, first, second) {
    if (order === orders.cdab) {
        return [second, first];
    }
    return [first, second];
}

/**
 * Decodes a float32 from two uint16 registers.
 *
 * @param {string} order - abcd or cdab
 * @param {number} first - first register in the window
 * @param {number} second - second register in the window
 * @returns {number} decoded float
 */
function floatOf(order, first, second) {
    const pair = placed(order, first, second);
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint16(0, pair[0]);
    view.setUint16(2, pair[1]);
    return view.getFloat32(0);
}

/**
 * Decodes one holding point from a register window.
 *
 * @example
 *   decodePoint('holding:4000:cdab', 4000, [0, 16256]);
 *
 * @param {string} point - register point
 * @param {number} origin - first PDU address in the window
 * @param {Array<number>} registers - uint16 window
 * @returns {number} decoded value
 */
export function decodePoint(point, origin, registers) {
    const parsed = parsePoint(point);
    const index = parsed.address - origin;
    if (!Array.isArray(registers) || index < 0 || index + parsed.width > registers.length) {
        throw new Error(`Register point ${point} is outside the window at ${origin}`);
    }
    if (parsed.order === orders.uint16) {
        return registers[index];
    }
    return floatOf(parsed.order, registers[index], registers[index + 1]);
}
