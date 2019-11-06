import {
    IExpiringSetOptions,
    ExpiringSet,
} from './ExpiringSet';

import * as chai from 'chai';
import 'mocha';

const expect = chai.expect;

async function sleep(ms : number) : Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

describe('ExpiringSet', function () {
    it('constructor can add values from iterable', function () {
        const foo = "foo";
        const set = new ExpiringSet([foo]);

        expect(set.has(foo)).to.equal(true);

        set.clear();
    });

    it('add() should add entries', function () {
        const set = new ExpiringSet();
        const foo = "foo";

        set.add(foo);
        expect(set.has(foo)).to.equal(true);

        expect((<any>set).gcTimer).to.not.equal(undefined);

        set.clear();
    });

    it('delete() should remove entries', function () {
        const set = new ExpiringSet();

        const foo = "foo";

        set.add(foo);
        expect(set.has(foo)).to.equal(true);

        set.delete(foo);
        expect(set.has(foo)).to.equal(false);

        expect((<any>set).entries.size).to.equal(0);
        expect((<any>set).buckets.size).to.equal(0);
        expect((<any>set).gcTimer).to.equal(undefined);
    });

    it('clear() should remove all entries', function () {
        const set = new ExpiringSet();

        const foo1 = "foo1", foo2 = "foo2";

        set.add(foo1);
        set.add(foo2);

        expect(set.has(foo1)).to.equal(true);
        expect(set.has(foo2)).to.equal(true);

        expect((<any>set).gcTimer).to.not.equal(undefined);

        set.clear();

        expect(set.has(foo1)).to.equal(false);
        expect(set.has(foo2)).to.equal(false);

        expect((<any>set).entries.size).to.equal(0);
        expect((<any>set).buckets.size).to.equal(0);
        expect((<any>set).gcTimer).to.equal(undefined);
    });

    it('should GC expire entries', async function () {
        const set = new ExpiringSet(null, {
            ttl: 10,
            gc: 10
        });
        const foo = "foo";

        set.add(foo);

        await sleep(20);

        expect(set.has(foo)).to.equal(false);

        expect((<any>set).entries.size).to.equal(0);
        expect((<any>set).buckets.size).to.equal(0);
        expect((<any>set).gcTimer).to.equal(undefined);
    });

    it('should treat expired (but not yet deleted) values as gone', async function () {
        const set = new ExpiringSet(null, {
            ttl: 10,
            gc: 10
        });
        const foo = "foo";

        set.add(foo);

        expect(set.has(foo)).to.equal(true);

        clearTimeout((<any>set).gcTimer);
        delete (<any>set).gcTimer;

        await sleep(20);

        expect(set.has(foo)).to.equal(false);

        expect((<any>set).entries.size).to.equal(1);
        expect((<any>set).buckets.size).to.equal(1);
    });

    it('should switch GC buckets for values that have not yet been expired', async function () {
        const set = new ExpiringSet(null, {
            ttl: 10,
            gc: 10
        });
        const foo = "foo";

        set.add(foo);

        expect(set.has(foo)).to.equal(true);
        const id1 = (<any>set).entries.get(foo);

        clearTimeout((<any>set).gcTimer);
        delete (<any>set).gcTimer;

        await sleep(20);

        expect(set.has(foo)).to.equal(false);

        expect((<any>set).entries.get(foo) === id1);
        expect((<any>set).entries.size).to.equal(1);
        expect((<any>set).buckets.size).to.equal(1);

        set.add(foo);
        const id2 = (<any>set).entries.get(foo);

        expect(id1).to.not.equal(id2);

        expect((<any>set).entries.size).to.equal(1);
        expect((<any>set).buckets.size).to.equal(1);
    });

    it('should only GC expired values', async function () {
        const set = new ExpiringSet<String>(null, {
            ttl: 30,
            gc: 10
        });
        const foo1 = "foo1", foo2 = "foo2";

        let gc = false;
        set.listen(values => {
            expect(gc).to.equal(false);
            gc = true;
            expect(values).to.deep.equal([foo1]);
        });

        set.add(foo1);
        expect(set.size).to.equal(1);

        await sleep(20);

        set.add(foo2);
        expect(set.size).to.equal(2);

        await sleep(20);

        expect(set.size).to.equal(1);

        set.clear();

        expect(gc).to.equal(true);
    });

    it('should expire multiple buckets at once', async function () {
        const set = new ExpiringSet<String>(null, {
            ttl: 10,
            gc: 10
        });

        let gc = false;
        set.listen(values => {
            expect(gc).to.equal(false);
            gc = true;
            expect(values).to.deep.equal([foo1, foo2]);
        });

        const foo1 = "foo1", foo2 = "foo2";

        set.add(foo1);

        clearTimeout((<any>set).gcTimer);

        await sleep(20);

        set.add(foo2);

        await sleep(20);

        (<any>set).__gc();

        expect((<any>set).entries.size).to.equal(0);
        expect((<any>set).buckets.size).to.equal(0);
        expect((<any>set).gcTimer).to.equal(undefined);

        expect(gc).to.equal(true);
    });
});