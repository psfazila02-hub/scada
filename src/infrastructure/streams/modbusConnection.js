import ModbusRTU from 'modbus-serial';
import deadline from './deadline.js';

/**
 * Idle state for Modbus connection.
 *
 * @returns {object} State with no open attempt
 */
export function idle() {
  return {
    connected() {
      return false;
    },
    retrying() {
      return false;
    },
    opening() {
      return false;
    }
  };
}

/**
 * Retrying state for Modbus connection.
 *
 * @param {object} handle - Timer handle from setTimeout
 * @returns {object} State with retrying() returning true
 */
function retrying(handle) {
  return {
    connected() {
      return false;
    },
    retrying() {
      return true;
    },
    opening() {
      return false;
    },
    cancel() {
      clearTimeout(handle);
    }
  };
}

/**
 * In-flight TCP or RTU connect state.
 *
 * @returns {object} State with opening() returning true
 */
export function opening() {
  return {
    connected() {
      return false;
    },
    retrying() {
      return false;
    },
    opening() {
      return true;
    }
  };
}

/**
 * Connected state for Modbus connection.
 *
 * @param {object} client - ModbusRTU client
 * @returns {object} State with connected() returning true
 */
function connected(client) {
  return {
    connected() {
      return true;
    },
    retrying() {
      return false;
    },
    opening() {
      return false;
    },
    disconnect() {
      client.close();
    }
  };
}

/**
 * Destroys a Modbus client without throwing if already closed.
 *
 * @param {object} client - ModbusRTU client
 */
export function drop(client) {
  if (client && typeof client.destroy === 'function') {
    client.destroy(() => {
      return undefined;
    });
  }
}

/**
 * Builds a ModbusRTU client for one connect attempt.
 *
 * @returns {object} Fresh ModbusRTU client
 */
export function create() {
  return new ModbusRTU();
}

/**
 * Starts one connect attempt and ignores results after stop().
 *
 * @param {object} bag - Mutable lifecycle bag
 */
export function attempt(bag) {
  const token = bag.epoch;
  bag.state = opening();
  drop(bag.client);
  const client = bag.create();
  bag.client = client;
  const connecting = bag.connect(client);
  void connecting.then(() => { if (token !== bag.epoch) { drop(client); } }).catch(() => { return undefined; });
  bag.opened = deadline(connecting, 5000, 'Modbus connect', (error) => {
    bag.fatal = error; bag.epoch += 1; drop(client);
  }).then(() => {
    if (token !== bag.epoch) {
      drop(client);
      return;
    }
    bag.delay = bag.interval;
    bag.state = connected(client);
    client.setTimeout(bag.interval * 1000);
    client.once('close', () => {
      if (token === bag.epoch && bag.client === client) { bag.lost(); }
    });
    void bag.source.start().catch((error) => { bag.fatal = error; drop(client); });
  }).catch((err) => {
    if (token !== bag.epoch) {
      return;
    }
    drop(bag.client);
    bag.log.error(`Connection to ${bag.target} failed, retrying in ${bag.delay}s: ${err.message}`);
    const handle = setTimeout(() => {
      attempt(bag);
    }, bag.delay * 1000);
    bag.state = retrying(handle);
    bag.delay = Math.min(bag.delay * 2, bag.maxDelay);
  });
}

/**
 * Resets a live session and retries through attempt() backoff.
 *
 * @param {object} bag - Mutable lifecycle bag
 */
export function resume(bag) {
  if (!bag.state.connected()) {
    return;
  }
  const drained = bag.source.stop();
  const { client } = bag;
  bag.client = undefined;
  bag.state = idle();
  drop(client);
  bag.log.error(`Connection to ${bag.target} lost, retrying in ${bag.delay}s`);
  const token = bag.epoch;
  const handle = setTimeout(() => {
    void drained.then(() => { if (token === bag.epoch) { attempt(bag); } }).catch((error) => { bag.fatal = error; });
  }, bag.delay * 1000);
  bag.state = retrying(handle);
  bag.delay = Math.min(bag.delay * 2, bag.maxDelay);
}

