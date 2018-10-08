import { Company, User } from "../../Assets/Entities";
import * as assert from "assert";
import { parser } from "stream-json/Parser";
import { testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";

import {
    IDocumentStore,
} from "../../../src";
import { AsyncQueue } from "../../Utils/AsyncQueue";
import { SubscriptionBatch } from "../../../src/Documents/Subscriptions/SubscriptionBatch";
import { SubscriptionWorkerOptions } from "../../../src/Documents/Subscriptions/SubscriptionWorkerOptions";
import { SubscriptionCreationOptions } from "../../../src/Documents/Subscriptions/SubscriptionCreationOptions";
import * as semaphore from "semaphore";
import { acquireSemaphore } from "../../../src/Utility/SemaphoreUtil";
import { SubscriptionWorker } from "../../../src/Documents/Subscriptions/SubscriptionWorker";
import { getError, throwError } from "../../../src/Exceptions";
import { TypeUtil } from "../../../src/Utility/TypeUtil";

describe("SubscriptionsBasicTest", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    const _reasonableWaitTime = 10 * 1000;

    it("can delete subscription", async () => {
        const id1 = await store.subscriptions.create(User);
        const id2 = await store.subscriptions.create(User);

        let subscriptions = await store.subscriptions.getSubscriptions(0, 5);

        assert.strictEqual(subscriptions.length, 2);

        // test getSubscriptionState as well
        const subscriptionState = await store.subscriptions.getSubscriptionState(id1);
        assert.ok(!subscriptionState.changeVectorForNextBatchStartingPoint);

        await store.subscriptions.delete(id1);
        await store.subscriptions.delete(id2);

        subscriptions = await store.subscriptions.getSubscriptions(0, 5);
        assert.strictEqual(subscriptions.length, 0);
    });

    it("should throw when opening no existing subscription", done => {
        const subscription = store.subscriptions.getSubscriptionWorker<any>({
            subscriptionName: "1"
        });

        subscription.on("error", err => {
            assert.strictEqual(err.name, "SubscriptionDoesNotExistException");
            done();
        });

        subscription.on("batch", TypeUtil.NOOP); // this triggers subscription to run
    });

    it("should throw on attempt to open already opened subscription", async () => {
        const id = await store.subscriptions.create(User);

        const subscription = store.subscriptions.getSubscriptionWorker<any>({
            subscriptionName: id
        });

        try {
            const session = store.openSession();
            await session.store(new User());
            await session.saveChanges();

            const changesList = new AsyncQueue<SubscriptionBatch<any>>();

            subscription.on("batch", x => changesList.push(x));

            const value = await changesList.poll(_reasonableWaitTime);
            assert.ok(value);

            {
                const secondSubscription = store.subscriptions.getSubscriptionWorker({
                    subscriptionName: id,
                    strategy: "OpenIfFree"
                });

                secondSubscription.on("batch", () => {
                    assert.fail("We shouldn't get any data as subscription is occupied");
                });

                await new Promise(resolve => {
                    secondSubscription.on("error", ex => {
                        assert.strictEqual(ex.name, "SubscriptionInUseException");
                        resolve();
                    });
                });
            }
        } finally {
            subscription.dispose();
        }
    });

    it("should stream all documents after subscription creation", async () => {
        store.initialize();
        {
            const session = store.openSession();
            const user1 = new User();
            user1.age = 31;
            await session.store(user1, "users/1");

            const user2 = new User();
            user2.age = 27;
            await session.store(user2, "users/12");

            const user3 = new User();
            user3.age = 25;
            await session.store(user3, "users/3");

            await session.saveChanges();
        }

        const id = await store.subscriptions.create(User);

        const subscription = store.subscriptions.getSubscriptionWorker<User>({
            subscriptionName: id,
            documentType: User
        });

        const keys = new AsyncQueue<string>();
        const ages = new AsyncQueue<number>();

        subscription.on("batch", (batch, callback) => {
            batch.items.forEach(x => keys.push(x.id));
            batch.items.forEach(x => ages.push(x.result.age));
            callback();
        });

        let key = await keys.poll(_reasonableWaitTime);
        assert.strictEqual(key, "users/1");

        key = await keys.poll(_reasonableWaitTime);
        assert.strictEqual(key, "users/12");

        key = await keys.poll(_reasonableWaitTime);
        assert.strictEqual(key, "users/3");

        let age = await ages.poll(_reasonableWaitTime);
        assert.strictEqual(age, 31);

        age = await ages.poll(_reasonableWaitTime);
        assert.strictEqual(age, 27);

        age = await ages.poll(_reasonableWaitTime);
        assert.strictEqual(age, 25);
    });

    it("should send all new and modified docs", async () => {
        const id = await store.subscriptions.create(User);

        const subscription = store.subscriptions.getSubscriptionWorker<User>({
            subscriptionName: id,
            documentType: User
        });

        try {
            const names = new AsyncQueue<string>();

            {
                const session = store.openSession();
                const user = new User();
                user.name = "James";
                await session.store(user, "users/1");
                await session.saveChanges();
            }

            subscription.on("batch", (batch, callback) => {
                batch.items.forEach(x => {
                    names.push(x.result.name);
                });
                callback();
            });

            let name = await names.poll(_reasonableWaitTime);
            assert.strictEqual(name, "James");

            {
                const session = store.openSession();
                const user = new User();
                user.name = "Adam";
                await session.store(user, "users/12");
                await session.saveChanges();
            }

            name = await names.poll(_reasonableWaitTime);
            assert.strictEqual(name, "Adam");

            {
                const session = store.openSession();
                const user = new User();
                user.name = "David";
                await session.store(user, "users/1");
                await session.saveChanges();
            }

            name = await names.poll(_reasonableWaitTime);
            assert.strictEqual(name, "David");
        } finally {
            subscription.dispose();
        }
    });

    it("should respect max doc count in batch", async () => {
        {
            const session = store.openSession();
            for (let i = 0; i < 100; i++) {
                await session.store(new Company());
            }
            await session.saveChanges();
        }

        const id = await store.subscriptions.create(Company);
        const options = {
            subscriptionName: id,
            maxDocsPerBatch: 25
        } as SubscriptionWorkerOptions<Company>;

        const subscriptionWorker = store.subscriptions.getSubscriptionWorker(options);

        try {
            let totalItems = 0;

            await new Promise(resolve => {
                subscriptionWorker.on("batch", (batch, callback) => {
                    totalItems += batch.getNumberOfItemsInBatch();

                    assert.ok(batch.getNumberOfItemsInBatch() <= 25);

                    if (totalItems === 100) {
                        resolve();
                    }
                    callback();
                });
            });
        } finally {
            subscriptionWorker.dispose();
        }
    });

    it("should respect collection criteria", async () => {
        {
            const session = store.openSession();
            for (let i = 0; i < 100; i++) {
                await session.store(new Company());
                await session.store(new User());
            }

            await session.saveChanges();
        }

        const id = await store.subscriptions.create(User);

        const options = {
            subscriptionName: id,
            maxDocsPerBatch: 31
        } as SubscriptionWorkerOptions<User>;

        const subscription = store.subscriptions.getSubscriptionWorker(options);

        try {
            let integer = 0;

            await new Promise(resolve => {
                subscription.on("batch", (batch, callback) => {
                    integer += batch.getNumberOfItemsInBatch();

                    if (integer === 100) {
                        resolve();
                    }
                    callback();
                });
            });
        } finally {
            subscription.dispose();
        }
    });

    it("will acknowledge empty batches", async () => {
        const subscriptionDocuments = await store.subscriptions.getSubscriptions(0, 10);

        assert.strictEqual(subscriptionDocuments.length, 0);

        const allId = await store.subscriptions.create(User);

        const allSubscription = store.subscriptions.getSubscriptionWorker(allId);
        try {
            const allSemaphore = semaphore();
            allSemaphore.take(TypeUtil.NOOP);

            let allCounter = 0;

            const filteredOptions = {
                query: "from Users where age < 0"
            } as SubscriptionCreationOptions;

            const filteredUsersId = await store.subscriptions.create(filteredOptions);

            const filteredUsersSubscription = store.subscriptions.getSubscriptionWorker({
                subscriptionName: filteredUsersId
            });

            try {
                let usersDocs = false;

                {
                    const session = store.openSession();
                    for (let i = 0; i < 500; i++) {
                        await session.store(new User(), "another/");
                    }
                    await session.saveChanges();
                }

                allSubscription.on("batch", (batch, callback) => {
                    allCounter += batch.getNumberOfItemsInBatch();

                    if (allCounter >= 100) {
                        allSemaphore.leave();
                    }

                    callback();
                });

                filteredUsersSubscription.on("batch", (batch, callback) => {
                    usersDocs = true;
                    callback();
                });

                await acquireSemaphore(allSemaphore).promise;
                assert.ok(!usersDocs);
            } finally {
                filteredUsersSubscription.dispose();
            }
        } finally {
            allSubscription.dispose();
        }
    });

    it("can release subscription", async () => {
        let subscriptionWorker: SubscriptionWorker<any>;
        let throwingSubscriptionWorker: SubscriptionWorker<any>;
        let notThrowingSubscriptionWorker: SubscriptionWorker<any>;

        try {
            const id = await store.subscriptions.create(User);

            const options1 = {
                subscriptionName: id,
                strategy: "OpenIfFree"
            } as SubscriptionWorkerOptions<User>;

            subscriptionWorker = store.subscriptions.getSubscriptionWorker(options1);

            const mre = semaphore(1);
            mre.take(TypeUtil.NOOP); // block by default

            await putUserDoc(store);

            subscriptionWorker.on("error", TypeUtil.NOOP);

            subscriptionWorker.on("batch", (batch, callback) => {
                mre.leave(1);
                callback();
            });

            await acquireSemaphore(mre, { timeout: _reasonableWaitTime }).promise;
            mre.leave();

            const options2 = {
                subscriptionName: id,
                strategy: "OpenIfFree"
            } as SubscriptionWorkerOptions<User>;

            throwingSubscriptionWorker = store.subscriptions.getSubscriptionWorker(options2);

            await new Promise(resolve => {
                throwingSubscriptionWorker.on("error", error => {
                    assert.strictEqual(error.name, "SubscriptionInUseException");
                    resolve();
                });

                throwingSubscriptionWorker.on("batch", (batch, callback) => {
                    callback();
                });
            });

            await store.subscriptions.dropConnection(id);

            notThrowingSubscriptionWorker = store.subscriptions.getSubscriptionWorker({
                subscriptionName: id
            });

            notThrowingSubscriptionWorker.on("batch", (batch, callback) => {
                mre.leave(1);
                callback();
            });

            await putUserDoc(store);

            await acquireSemaphore(mre, { timeout: _reasonableWaitTime });
        } finally {
            if (subscriptionWorker) {
                subscriptionWorker.dispose();
            }
            if (throwingSubscriptionWorker) {
                throwingSubscriptionWorker.dispose();
            }
            if (notThrowingSubscriptionWorker) {
                notThrowingSubscriptionWorker.dispose();
            }
        }
    });

    const putUserDoc = async (store: IDocumentStore) => {
        const session = store.openSession();
        await session.store(new User());
        await session.saveChanges();
    };

    it("should pull documents after bulk insert", async () => {
        const id = await store.subscriptions.create(User);

        const subscription = store.subscriptions.getSubscriptionWorker<User>({
            subscriptionName: id,
            documentType: User
        });

        const docs = new AsyncQueue<User>();

        const bulk = store.bulkInsert();
        {
            await bulk.store(new User());
            await bulk.store(new User());
            await bulk.store(new User());
            await bulk.finish();
        }

        subscription.on("batch", (batch, callback) => {
            batch.items.forEach(i => docs.push(i.result));
            callback();
        });

        assert.ok(await docs.poll(_reasonableWaitTime));
        assert.ok(await docs.poll(_reasonableWaitTime));
    });

    it("should stop pulling docs and close subscription on subscriber error by default", async () => {
        const id = await store.subscriptions.create(User);

        const subscription = store.subscriptions.getSubscriptionWorker({
            subscriptionName: id
        });

        await putUserDoc(store);

        subscription.on("batch", (batch, callback) => {
            throwError("InvalidOperationException", "Fake exception");
            callback();
        });

        await new Promise(resolve => {
            subscription.on("error", error => {
                assert.strictEqual(error.name, "SubscriberErrorException");

                resolve();
            });
        });

        const subscriptionConfig = (await store.subscriptions.getSubscriptions(0, 1))[0];
        assert.ok(!subscriptionConfig.changeVectorForNextBatchStartingPoint);
    });

    it("can set to ignore subscriber errors", async () => {
        const id = await store.subscriptions.create(User);

        const options1 = {
            ignoreSubscriberErrors: true,
            subscriptionName: id,
            documentType: User
        } as SubscriptionWorkerOptions<User>;

        const subscription = store.subscriptions.getSubscriptionWorker(options1);
        try {
            const docs = new AsyncQueue<User>();

            await putUserDoc(store);
            await putUserDoc(store);

            let hasError = false;

            subscription.on("error", () => {
                hasError = true;
            });

            subscription.on("batch", (batch, callback) => {
                batch.items.forEach(i => docs.push(i.result));
                callback(getError("InvalidOperationException", "Fake exception"));
            });

            assert.ok(await docs.poll(_reasonableWaitTime));
            assert.ok(await docs.poll(_reasonableWaitTime));
            assert.ok(!hasError);
        } finally {
            subscription.dispose();
        }
    });

    it("RavenDB-3452 should should stop pulling docs if released", async () => {
        const id = await store.subscriptions.create(User);

        const options1 = {
            subscriptionName: id,
            timeToWaitBeforeConnectionRetry: 1000,
            documentType: User
        } as SubscriptionWorkerOptions<User>;

        const subscription = store.subscriptions.getSubscriptionWorker(options1);

        {
            const session = store.openSession();
            await session.store(new User(), "users/1");
            await session.store(new User(), "users/12");
            await session.saveChanges();
        }

        const docs = new AsyncQueue<User>();

        subscription.on("batch", (batch, callback) => {
            batch.items.forEach(i => docs.push(i.result));
            callback();
        });

        assert.ok(await docs.poll(_reasonableWaitTime));
        assert.ok(await docs.poll(_reasonableWaitTime));

        await new Promise(async resolve => {
            subscription.on("error", error => {
                assert.strictEqual(error.name, "SubscriptionClosedException");
                resolve();
            });

            await store.subscriptions.dropConnection(id);
        });

        {
            const session = store.openSession();
            await session.store(new User(), "users/3");
            await session.store(new User(), "users/4");
            await session.saveChanges();
        }

        assert.ok(!await docs.poll(50));
        assert.ok(!await docs.poll(50));
    });

    it("RavenDB-3453 should deserialize the whole documents after typed subscription", async () => {
        const id = await store.subscriptions.create(User);
        const subscription = store.subscriptions.getSubscriptionWorker<User>({
            documentType: User,
            subscriptionName: id
        });

        try {
            const users = new AsyncQueue<User>();

            {
                const session = store.openSession();
                const user1 = new User();
                user1.age = 31;
                await session.store(user1, "users/1");

                const user2 = new User();
                user2.age = 27;
                await session.store(user2, "users/12");

                const user3 = new User();
                user3.age = 25;
                await session.store(user3, "users/3");

                await session.saveChanges();
            }

            subscription.on("batch", (batch, callback) => {
                batch.items.forEach(i => users.push(i.result));
                callback();
            });

            let user: User;
            user = await users.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/1");
            assert.strictEqual(user.age, 31);

            user = await users.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/12");
            assert.strictEqual(user.age, 27);

            user = await users.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/3");
            assert.strictEqual(user.age, 25);
        } finally {
            subscription.dispose();
        }
    });

    it("disposing one subscription should not affect on notifications of others", async () => {
        let subscription1: SubscriptionWorker<User>;
        let subscription2: SubscriptionWorker<User>;

        try {
            const id1 = await store.subscriptions.create(User);
            const id2 = await store.subscriptions.create(User);

            {
                const session = store.openSession();
                await session.store(new User(), "users/1");
                await session.store(new User(), "users/2");
                await session.saveChanges();
            }

            subscription1 = store.subscriptions.getSubscriptionWorker<User>({
                subscriptionName: id1,
                documentType: User
            });
            const items1 = new AsyncQueue<User>();
            subscription1.on("batch", (batch, callback) => {
                batch.items.forEach(i => items1.push(i.result));
                callback();
            });

            subscription2 = store.subscriptions.getSubscriptionWorker<User>({
                subscriptionName: id2,
                documentType: User
            });
            const items2 = new AsyncQueue<User>();
            subscription2.on("batch", (batch, callback) => {
                batch.items.forEach(i => items2.push(i.result));
                callback();
            });

            let user = await items1.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/1");

            user = await items1.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/2");

            user = await items2.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/1");

            user = await items2.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/2");

            subscription1.dispose();

            {
                const session = store.openSession();
                await session.store(new User(), "users/3");
                await session.store(new User(), "users/4");
                await session.saveChanges();
            }

            user = await items2.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/3");

            user = await items2.poll(_reasonableWaitTime);
            assert.ok(user);
            assert.strictEqual(user.id, "users/4");
        } finally {
            if (subscription1) {
                subscription1.dispose();
            }
            if (subscription2) {
                subscription2.dispose();
            }
        }
    });

    it.skip("test subscription with PascalCasing");
    it.skip("test revisions subscription with PascalCasing");
    it.skip("should we support async handlers?");
});
