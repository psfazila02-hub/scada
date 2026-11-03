/**
 * Parses one scalar token.
 *
 * @param {string} text - raw scalar
 * @returns {string|number|boolean|null} scalar
 */
function scalar(text) {
    const trimmed = text.trim();
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (trimmed === 'null') {
        return null;
    }
    if (/^-?\d+$/u.test(trimmed)) {
        return Number(trimmed);
    }
    if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/**
 * Splits `key: value` on the first colon.
 *
 * @param {string} body - line without indent
 * @returns {{key: string, rest: string}} key and remainder
 */
function splitKey(body) {
    const mark = body.indexOf(':');
    if (mark < 0) {
        return { key: '', rest: body.trim() };
    }
    return { key: body.slice(0, mark).trim(), rest: body.slice(mark + 1).trim() };
}

/**
 * Parses the block that starts at index.
 *
 * @param {Array<{indent: number, body: string}>} rows - content lines
 * @param {number} index - first line
 * @returns {{value: object|Array, next: number}} block and following index
 */
function block(rows, index) {
    if (index >= rows.length) {
        return { value: {}, next: index };
    }
    if (rows[index].body.startsWith('- ')) {
        // eslint-disable-next-line no-use-before-define -- list and map call back into block
        return list(rows, index);
    }
    // eslint-disable-next-line no-use-before-define -- list and map call back into block
    return map(rows, index);
}

/**
 * Parses a map whose keys share the indent of the first row.
 *
 * @param {Array<{indent: number, body: string}>} rows - content lines
 * @param {number} index - first key
 * @returns {{value: object, next: number}} map and following index
 */
function map(rows, index) {
    const value = {};
    const { indent } = rows[index];
    let cursor = index;
    while (cursor < rows.length && rows[cursor].indent === indent && !rows[cursor].body.startsWith('- ')) {
        const piece = splitKey(rows[cursor].body);
        if (piece.rest === '') {
            const nested = block(rows, cursor + 1);
            value[piece.key] = nested.value;
            cursor = nested.next;
        } else {
            value[piece.key] = scalar(piece.rest);
            cursor += 1;
        }
    }
    return { value, next: cursor };
}

/**
 * Parses a list whose items share the indent of the first row.
 *
 * @param {Array<{indent: number, body: string}>} rows - content lines
 * @param {number} index - first item
 * @returns {{value: Array, next: number}} list and following index
 */
function list(rows, index) {
    const value = [];
    const { indent } = rows[index];
    let cursor = index;
    while (cursor < rows.length && rows[cursor].indent === indent && rows[cursor].body.startsWith('- ')) {
        // eslint-disable-next-line no-use-before-define -- item is the list element parser
        const taken = item(rows, cursor, indent);
        value.push(taken.value);
        cursor = taken.next;
    }
    return { value, next: cursor };
}

/**
 * Copies keys that sit under a list item after its first line.
 *
 * @param {Array<{indent: number, body: string}>} rows - content lines
 * @param {number} cursor - first continuation line
 * @param {number} indent - item indent
 * @param {object} value - item being built
 * @returns {number} index after those keys
 */
function siblings(rows, cursor, indent, value) {
    if (cursor >= rows.length || rows[cursor].indent <= indent || rows[cursor].body.startsWith('- ')) {
        return cursor;
    }
    const more = map(rows, cursor);
    Object.assign(value, more.value);
    return more.next;
}

/**
 * Parses one list item, including keys on the following lines.
 *
 * @param {Array<{indent: number, body: string}>} rows - content lines
 * @param {number} index - item line
 * @param {number} indent - item indent
 * @returns {{value: object|string|number|boolean|null, next: number}} item
 */
function item(rows, index, indent) {
    const body = rows[index].body.slice(2);
    const piece = splitKey(body);
    if (piece.key === '') {
        return { value: scalar(piece.rest), next: index + 1 };
    }
    const value = {};
    if (piece.rest === '') {
        const nested = block(rows, index + 1);
        value[piece.key] = nested.value;
        return { value, next: siblings(rows, nested.next, indent, value) };
    }
    value[piece.key] = scalar(piece.rest);
    return { value, next: siblings(rows, index + 1, indent, value) };
}

/**
 * Reads the system document subset: nested maps, lists, and scalars.
 *
 * @example
 *   readDocument('servers:\n  - id: cell\n');
 *
 * @param {string} text - document file contents
 * @returns {object} plain system document
 */
export default function readDocument(text) {
    const rows = [];
    text.split('\n').forEach((raw) => {
        if (raw.trim() !== '' && !raw.trimStart().startsWith('#')) {
            const indent = raw.search(/\S/u);
            rows.push({ indent, body: raw.slice(indent) });
        }
    });
    return block(rows, 0).value;
}
