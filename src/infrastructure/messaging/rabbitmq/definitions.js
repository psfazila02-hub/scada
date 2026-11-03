/** Builds durable topic exchanges, queues and AMQP 0-9-1 outboxes for one virtual host. */
export default function rabbitmqDefinitions({ vhost, users = [], permissions = [], exchanges = [],
    queues = [], bindings = [], outboxes = [] }) {
    if (!vhost) { throw new Error('a virtual host is required'); }
    const routes = outboxes.flatMap(({ exchange, queue, keys }) => {
        return keys.map((key) => { return { source: exchange, destination: queue, key }; });
    });
    const names = [...queues, ...outboxes.map(({ queue }) => { return queue; })];
    return { vhosts: [{ name: vhost }], users, permissions,
        exchanges: exchanges.map((name) => { return { name, vhost, type: 'topic', durable: true, auto_delete: false }; }),
        queues: [...new Set(names)].map((name) => { return { name, vhost, durable: true, auto_delete: false, arguments: {} }; }),
        bindings: [...bindings, ...routes].map(({ source, destination, key }) => {
            return { source, vhost, destination, destination_type: 'queue', routing_key: key, arguments: {} };
        }),
        parameters: outboxes.filter(({ shovel }) => { return shovel; }).map(({ queue, shovel }) => {
            return { vhost, component: 'shovel', name: shovel.name, value: {
                'src-protocol': 'amqp091', 'src-uri': shovel.sourceUri, 'src-queue': queue,
                'dest-protocol': 'amqp091', 'dest-uri': shovel.destinationUri,
                'dest-exchange': shovel.destinationExchange, 'reconnect-delay': shovel.reconnectDelay,
                'dest-publish-properties': { delivery_mode: 2 }
            } };
        })
    };
}
