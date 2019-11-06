export interface IExpiringSetOptions {
    gc: number;
    ttl: number;
}

export type ExpiringSetListener<V> = (values: V[]) => void;

export class ExpiringSet<T = string> {
    private gcTimer: number | undefined;
    private entries: Map<T, number> = new Map<T, number>();
    private buckets: Map<number, Set<T>> = new Map<number, Set<T>>();
    private options: IExpiringSetOptions;
    private listeners: Array<ExpiringSetListener<T>> = new Array<ExpiringSetListener<T>>();

    constructor(options: Partial<IExpiringSetOptions> = {}) {
        this.options = Object.assign({
            gc: 1000,
            ttl: 5000,
        }, options);
    }

    public get size(): number {
        return this.entries.size;
    }

    public add(v: T): void {
        const id = Math.floor(new Date().getTime() / this.options.gc);

        if (this.entries.has(v)) {
            const currentId = this.entries.get(v);

            if (currentId !== id) {
                const bucket = this.buckets.get(currentId);
                bucket.delete(v);

                if (!bucket.size) {
                    this.buckets.delete(currentId);
                }
            }
        }

        const newBucket = this.createBucket(id);
        this.entries.set(v, id);
        newBucket.add(v);

        this.gc();
    }

    public clear(): void {
        this.entries.clear();
        this.buckets.clear();

        this.gc();
    }

    public delete(v: T): void {
        if (!this.entries.has(v)) {
            return;
        }

        const id = this.entries.get(v);
        const bucket = this.buckets.get(id);
        bucket.delete(v);
        if (!bucket.size) {
            this.buckets.delete(id);
        }

        this.entries.delete(v);

        this.gc();
    }

    public has(v: T): boolean {
        if (!this.entries.has(v)) {
            return false;
        }

        const id = this.entries.get(v);
        const expired = Math.floor((new Date().getTime() - this.options.ttl) / this.options.gc);

        return id >= expired;
    }

    public listen(f: ExpiringSetListener<T>): void {
        this.listeners.push(f);
    }

    private createBucket(id: number): Set<T> {
        const existingBucket = this.buckets.get(id);
        if (existingBucket) {
            return existingBucket;
        }

        const newBucket = new Set<T>();
        this.buckets.set(id, newBucket);
        return newBucket;
    }

    private gc(): void {
        if (!this.entries.size) {
            if (this.gcTimer) {
                clearTimeout(this.gcTimer);
                delete this.gcTimer;
            }
            return;
        } else if (this.gcTimer) {
            return;
        }

        this.gcTimer = setTimeout(() => this.__gc(), this.options.gc);
    }

    private __gc(): void {
        delete this.gcTimer;

        const expired = Math.floor((new Date().getTime() - this.options.ttl) / this.options.gc);

        let values: T[] = [];
        for (const [id, bucket] of this.buckets) {
            if (id > expired) {
                continue;
            }

            values = [...values, ...(bucket.values())];

            this.buckets.delete(id);
        }

        for (const value of values) {
            this.entries.delete(value);
        }

        this.gc();

        if (!values.length) {
            return;
        }

        for (const listener of this.listeners) {
            try {
                listener(values);
            } catch (e) {} // tslint:disable-line
        }
    }
}
