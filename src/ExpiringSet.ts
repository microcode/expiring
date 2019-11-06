export interface IExpiringSetOptions {
    gc: number;
    ttl: number;
}

export interface ExpiringSet<T> {
    add(value: T): this;
    clear(): void;
    delete(value: T): boolean;
    //forEach(callbackFn: (value: T, value2: T, set: ExpiringSet<T>) => void, thisArg?: any): void;
    has(value: T): boolean;
    listen(f: ExpiringSetListener<T>): void;
    readonly size: number;
}

interface ExpiringSetConstructor {
    new <T = any>(values?: readonly T[] | null, options?: Partial<IExpiringSetOptions> | null): ExpiringSet<T>
}

export type ExpiringSetListener<V> = (values: V[]) => void;

class ExpiringSetImpl<T> implements ExpiringSet<T> {
    private gcTimer: number | undefined;
    private entries: Map<T, number> = new Map<T, number>();
    private buckets: Map<number, Set<T>> = new Map<number, Set<T>>();
    private options: IExpiringSetOptions;
    private listeners: Array<ExpiringSetListener<T>> = new Array<ExpiringSetListener<T>>();

    constructor(values?: readonly T[] | null, options: Partial<IExpiringSetOptions> = {}) {
        this.options = Object.assign({
            gc: 1000,
            ttl: 5000,
        }, options);

        if (values) {
            for (const value of values) {
                this.add(value);
            }
        }
    }

    public get size(): number {
        return this.entries.size;
    }

    public add(v: T): this {
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

        return this;
    }

    public clear(): void {
        this.entries.clear();
        this.buckets.clear();

        this.gc();
    }

    public delete(v: T): boolean {
        if (!this.entries.has(v)) {
            return false;
        }

        const id = this.entries.get(v);
        const bucket = this.buckets.get(id);
        bucket.delete(v);
        if (!bucket.size) {
            this.buckets.delete(id);
        }

        this.entries.delete(v);

        this.gc();

        return true;
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

export const ExpiringSet: ExpiringSetConstructor = ExpiringSetImpl;
