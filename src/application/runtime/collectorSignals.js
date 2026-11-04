/** Only the executable runner owns process-global signal handlers. */
export default function collectorSignals(collector) {
    function report(error) { process.stderr.write(`collector: ${error.name}\n`); }
    function stop() { void collector.stop().then(() => { process.exit(0); }, () => { process.exit(1); }); }
    function reload() { void collector.reload().catch(report); }
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    process.on('SIGHUP', reload);
    return () => {
        process.off('SIGTERM', stop);
        process.off('SIGINT', stop);
        process.off('SIGHUP', reload);
    };
}
