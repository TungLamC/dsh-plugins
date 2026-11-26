/** Single-consumer async channel. `close(error)` lets buffered values drain, then rejects. */
export class Channel {
    values = [];
    waiter;
    ended = false;
    failure;
    get closed() {
        return this.ended;
    }
    push(value) {
        if (this.ended)
            return;
        this.values.push(value);
        this.wake();
    }
    close(error) {
        if (this.ended)
            return;
        this.ended = true;
        this.failure = error;
        this.wake();
    }
    async next() {
        while (true) {
            if (this.values.length)
                return { value: this.values.shift(), done: false };
            if (this.failure)
                throw this.failure;
            if (this.ended)
                return { value: undefined, done: true };
            await new Promise((resolve) => {
                this.waiter = resolve;
            });
        }
    }
    [Symbol.asyncIterator]() {
        return this;
    }
    wake() {
        const waiter = this.waiter;
        this.waiter = undefined;
        waiter?.();
    }
}
/** A promise with its settle functions, settled at most once. */
export class Deferred {
    promise;
    settled = false;
    resolveFn;
    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolveFn = resolve;
        });
    }
    resolve(value) {
        if (this.settled)
            return;
        this.settled = true;
        this.resolveFn(value);
    }
}
