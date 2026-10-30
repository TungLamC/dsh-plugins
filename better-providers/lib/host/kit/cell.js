/**
 * A value whose latest state can be streamed to any number of watchers. A slow
 * watcher never queues changes: it gets the current value when it next asks.
 */
export function cell(initial, equal = Object.is) {
    let value = initial;
    let version = 0;
    const wakers = new Set();
    return {
        get: () => value,
        set(next) {
            if (equal(value, next))
                return;
            value = next;
            version += 1;
            for (const wake of [...wakers])
                wake();
        },
        async *watch(signal) {
            let seen = -1;
            while (!signal.aborted) {
                if (seen !== version) {
                    seen = version;
                    yield value;
                    continue;
                }
                const { promise, resolve } = Promise.withResolvers();
                const wake = () => { resolve(); };
                wakers.add(wake);
                signal.addEventListener('abort', wake, { once: true });
                try {
                    await promise;
                }
                finally {
                    wakers.delete(wake);
                    signal.removeEventListener('abort', wake);
                }
            }
        },
    };
}
