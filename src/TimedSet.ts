export type TimedSetOptions = {
    ttl: number,
    gc: number
};

export type TimedSetListener<V> = (values: Array<V>) => void;

export class TimedSet<T = String> {
    private gcTimer: number | undefined;
    private entries : Map<T, number> = new Map<T, number>();
    private buckets : Map<number, Set<T>> = new Map<number, Set<T>>();
    private options : TimedSetOptions;
    private listeners : Array<TimedSetListener<T>> = new Array<TimedSetListener<T>>();

    constructor(options : Partial<TimedSetOptions> = {}) {
        this.options = Object.assign({
            ttl: 5000,
            gc: 1000
        }, options);
    }

    get size() : number {
        return this.entries.size;
    }

    add(v: T) : void {
        let id = this.bucketId();

        if (this.entries.has(v)) {
            let currentId = this.entries.get(v);

            if (currentId !== id) {
                let bucket = this.buckets.get(currentId);
                bucket.delete(v);

                if (!bucket.size) {
                    this.buckets.delete(currentId);
                }
            }
        }

        let newBucket = this.createBucket(id);
        this.entries.set(v, id);
        newBucket.add(v);

        this.gc();
    }

    clear() : void {
        //console.log("CLEARING");

        this.entries.clear();
        this.buckets.clear();

        this.gc();
    }

    delete(v: T) : void {
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

    has(v: T) : boolean {
        if (!this.entries.has(v)) {
            return false;
        }

        const id = this.entries.get(v);
        let expired = Math.floor((new Date().getTime()-this.options.ttl) / this.options.gc);

        return id >= expired;
    }

    listen(f: TimedSetListener<T>) : void {
        this.listeners.push(f);
    }

    private createBucket(id : number) : Set<T> {
        let existingBucket = this.buckets.get(id);
        if (existingBucket) {
            return existingBucket;
        }

        let newBucket = new Set<T>();
        this.buckets.set(id, newBucket);
        return newBucket;
    }

    private bucketId() : number {
        return Math.floor(new Date().getTime() / this.options.gc);
    }

    private gc() : void {
        if (!this.entries.size) {
            if (this.gcTimer) {
                //console.log("GC UNSCHEDULE", this.entries.size);
                clearTimeout(this.gcTimer);
                delete this.gcTimer;
            }
            return;
        } else if (this.gcTimer) {
            return;
        }

        //console.log("GC SCHEDULE", this.entries.size);

        this.gcTimer = setTimeout(() => this.__gc(), this.options.gc);
    }

    private __gc() : void {
        delete this.gcTimer;

        let expired = Math.floor((new Date().getTime()-this.options.ttl) / this.options.gc);

        let values : Array<T> = new Array<T>();
        for (let [id, bucket] of this.buckets) {
            if (id > expired) {
                continue;
            }

            values = [...values, ...(bucket.values())];

            //console.log("DELETING BUCKET", id);
            this.buckets.delete(id);
        }

        for (let value of values) {
            this.entries.delete(value);
        }

        this.gc();

        if (!values.length) {
            return;
        }

        for (let listener of this.listeners) {
            try {
                listener(values);
            } catch (e) {}
        }
    }
}