import { getDefaultCertificateManager } from 'node-opcua';

let initialization;
/** node-opcua's shared manager is not safe to initialize concurrently on a cold PKI. */
export default function certificates() {
    initialization ??= getDefaultCertificateManager('PKI').initialize().catch((error) => {
        initialization = undefined;
        throw error;
    });
    return initialization;
}
