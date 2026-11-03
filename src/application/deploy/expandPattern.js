/**
 * Reports whether a token is a device address.
 *
 * @param {string} value - flow source
 * @returns {boolean} true when the token carries a scheme
 * @example
 *   isAddress('modbus://192.0.2.10:502');
 */
export function isAddress(value) {
    return typeof value === 'string' && value.includes('://');
}

/**
 * Rejects an empty path segment.
 *
 * @param {string} path - path or pattern
 * @returns {void}
 * @example
 *   assertSegments('mill/hall');
 */
function assertSegments(path) {
    if (path.split('/').some((part) => {
        return part.length === 0;
    })) {
        throw new Error(`system document path ${path} has an empty segment`);
    }
}

/**
 * Lists brace groups in one path.
 *
 * @param {string} text - path text
 * @returns {{body: string, end: number, start: number}[]} groups
 * @example
 *   groups('mill/{a,b}');
 */
function groups(text) {
    return [...text.matchAll(/\{(?<body>[^{}]*)\}/gu)].map((match) => {
        return {
            body: match.groups.body,
            end: match.index + match[0].length,
            start: match.index
        };
    });
}

/**
 * Splits one brace body into segment alternatives.
 *
 * @param {string} body - text inside braces
 * @returns {string[]} alternatives
 * @example
 *   alternatives('east,west');
 */
function alternatives(body) {
    const parts = body.split(',').map((part) => {
        return part.trim();
    });
    if (parts.some((part) => {
        return part.length === 0 || part.includes('/');
    })) {
        throw new Error(`system document brace ${body} is not one segment`);
    }
    return parts;
}

/**
 * Substitutes the index-th alternative of every brace group.
 *
 * @param {string} text - original path
 * @param {{end: number, start: number}[]} marks - brace groups
 * @param {string[][]} choices - alternatives per group
 * @param {number} index - shared alternative index
 * @returns {string} one concrete path
 * @example
 *   fill('mill/{a,b}', [], [], 0);
 */
function fill(text, marks, choices, index) {
    let built = '';
    let cursor = 0;
    marks.forEach((group, place) => {
        built += text.slice(cursor, group.start);
        built += choices[place][index];
        cursor = group.end;
    });
    return built + text.slice(cursor);
}

/**
 * Builds one zipped row per shared brace index.
 *
 * @param {string} text - original path
 * @param {{body: string, end: number, start: number}[]} marks - brace groups
 * @returns {string[]} concrete paths
 * @example
 *   rowsFrom('mill/{a,b}/{c,d}', []);
 */
function rowsFrom(text, marks) {
    const choices = marks.map((group) => {
        return alternatives(group.body);
    });
    const count = choices[0].length;
    if (choices.some((choice) => {
        return choice.length !== count;
    })) {
        throw new Error(`system document braces in ${text} differ in length`);
    }
    const rows = [];
    for (let index = 0; index < count; index += 1) {
        rows.push(fill(text, marks, choices, index));
    }
    return rows;
}

/**
 * Expands `{a,b}` groups in one path together.
 *
 * A fixed string is returned as a single-element list. Brace groups share an
 * index, so `{a,b}/{c,d}` becomes `a/c` and `b/d`.
 *
 * @param {string} text - path, server id, or address
 * @returns {string[]} expanded texts
 * @example
 *   zipped('mill/{east,west}/{alpha,beta}');
 */
export function zipped(text) {
    const marks = groups(text);
    if (marks.length === 0) {
        return [text];
    }
    return rowsFrom(text, marks);
}

/**
 * Reports whether a value matches a star pattern.
 *
 * `*` matches any remainder, including `/`.
 *
 * @param {string} pattern - pattern that may contain `*`
 * @param {string} value - concrete text
 * @returns {boolean} true when the value fits
 * @example
 *   fits('mill/*', 'mill/hall/unit');
 */
export function fits(pattern, value) {
    const body = pattern.split('*').map((part) => {
        return part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    }).join('.*');
    return new RegExp(`^${body}$`, 'u').test(value);
}

/**
 * Collects pool entries that fit one concrete pattern.
 *
 * @param {string} item - pattern without braces
 * @param {string[]} pool - existing values
 * @param {string} noun - path or server
 * @param {boolean} strict - whether a miss is an error
 * @param {string[]} matched - accumulator
 * @returns {void}
 * @example
 *   collect('mill/*', ['mill/hall'], 'path', true, []);
 */
function collect(item, pool, noun, strict, matched) {
    if (item.includes('*')) {
        pool.forEach((entry) => {
            if (fits(item, entry) && !matched.includes(entry)) {
                matched.push(entry);
            }
        });
        return;
    }
    if (!pool.includes(item)) {
        if (strict) {
            throw new Error(`system document has no ${noun} ${item}`);
        }
        return;
    }
    if (!matched.includes(item)) {
        matched.push(item);
    }
}

/**
 * Expands braces and `*` against values that already exist.
 *
 * @param {string} pattern - path or server pattern
 * @param {string[]} pool - existing values
 * @param {string} noun - path or server
 * @param {boolean} strict - whether a miss is an error
 * @returns {string[]} matches
 * @example
 *   picked('mill/*', ['mill/hall/unit'], 'path', true);
 */
export function picked(pattern, pool, noun, strict) {
    assertSegments(pattern);
    const concrete = zipped(pattern);
    const matched = [];
    concrete.forEach((item) => {
        assertSegments(item);
        collect(item, pool, noun, strict, matched);
    });
    if (matched.length === 0 && strict) {
        throw new Error(`system document has no ${noun} ${pattern}`);
    }
    return matched;
}
