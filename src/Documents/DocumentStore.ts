import * as uuid from "uuid";
import * as BluebirdPromise from "bluebird";

import { throwError } from "../Exceptions";
import { RequestExecutor } from "../Http/RequestExecutor";
import { getLogger } from "../Utility/LogUtil";
import { DocumentStoreBase } from "./DocumentStoreBase";
import { IDocumentStore, SessionCreatedEventArgs } from "./IDocumentStore";
import { MaintenanceOperationExecutor } from "./Operations/MaintenanceOperationExecutor";
import { OperationExecutor } from "./Operations/OperationExecutor";
import { IDocumentSession, ISessionOptions } from "./Session/IDocumentSession";
import { DocumentSession } from "./Session/DocumentSession";
import {HiloMultiDatabaseIdGenerator} from "./Identity/HiloMultiDatabaseIdGenerator";
import { IDisposable } from "../Types/Contracts";
import { IAuthOptions } from "../Auth/AuthOptions";
import {BulkInsertOperation} from "./BulkInsertOperation";
import {IDatabaseChanges} from "./Changes/IDatabaseChanges";
import {DatabaseChanges} from "./Changes/DatabaseChanges";
import {EvictItemsFromCacheBasedOnChanges} from "./Changes/EvictItemsFromCacheBasedOnChanges";
import {Lazy} from "./Lazy";

const log = getLogger({ module: "DocumentStore" });

export class DocumentStore extends DocumentStoreBase {

    private _log = 
        getLogger({ module: "DocumentStore-" + Math.floor(Math.random() * 1000) });

    private readonly _databaseChanges: Map<string, IDatabaseChanges> = new Map();
    private _aggressiveCacheChanges: Map<string, Lazy<EvictItemsFromCacheBasedOnChanges>> = new Map();
    // TBD: private readonly ConcurrentDictionary<string, EvictItemsFromCacheBasedOnChanges>
    // _observeChangesAndEvictItemsFromCacheForDatabases = 
    // new ConcurrentDictionary<string, EvictItemsFromCacheBasedOnChanges>();

    private _requestExecutors: Map<string, RequestExecutor> = new Map(); 

    private _multiDbHiLo: HiloMultiDatabaseIdGenerator; 

    private _maintenanceOperationExecutor: MaintenanceOperationExecutor; 
    private _operationExecutor: OperationExecutor;

    private _identifier: string;
    private _aggressiveCachingUsed: boolean;
    
    public constructor(url: string, database: string);
    public constructor(urls: string[], database: string);
    public constructor(url: string, database: string, authOptions: IAuthOptions);
    public constructor(urls: string[], database: string, authOptions: IAuthOptions);
    public constructor(urls: string | string[], database: string, authOptions?: IAuthOptions) {
        super();

        this._database = database;
        this.authOptions = authOptions;
        this.urls = Array.isArray(urls) 
          ? urls as string[] 
          : [ urls ];
    }

    public get identifier(): string {
        if (this._identifier) {
            return this._identifier;
        }

        if (!this._urls) {
            return null;
        }

        const urlsString = this._urls.join(", ");
        if (this._database) {
            return `${ urlsString } DB: ${this._database}`;
        }

        return urlsString;
    }

    public set identifier(identifier: string) {
        this.identifier = identifier;
    }

    /**
     * Disposes the document store
     * 
     * @memberof DocumentStore
     */
    public dispose(): void {
        this._log.info("Dispose.");
        this.emit("beforeDispose");


        /* TBD
            foreach (var value in _aggressiveCacheChanges.Values)
            {
                if (value.IsValueCreated == false)
                    continue;

                value.Value.Dispose();
            }*/
        this._databaseChanges.forEach(change => change.dispose());

        /* TODO
            // try to wait until all the async disposables are completed
            Task.WaitAll(tasks.ToArray(), TimeSpan.FromSeconds(3));
            // if this is still going, we continue with disposal, it is for graceful shutdown only, anyway
        */

        const disposeChain = BluebirdPromise.resolve();

        disposeChain
            .then(() => {
                if (this._multiDbHiLo) {
                    return BluebirdPromise.resolve()
                        .then(() => this._multiDbHiLo.returnUnusedRange())
                        .catch(err => this._log.warn("Error returning unused ID range.", err));
                }
            })
            .then(() => {
                this._disposed = true;
                // TBD: Subscriptions?.Dispose();

                return new BluebirdPromise((resolve, reject) => {
                    let listenersExecCallbacksCount = 0;
                    const listenersCount = this.listenerCount("afterDispose");
                    this.emit("afterDispose", () => {
                        if (listenersCount === ++listenersExecCallbacksCount) {
                            resolve();
                        }
                    });

                })
                .timeout(5000) 
                .catch((err) => this._log.warn(`Error handling 'afterDispose'`, err));
            })
            .then(() => {
                this._log.info(`Disposing request executors ${this._requestExecutors.size}`);
                this._requestExecutors.forEach((executor, db) => {
                    try {
                        executor.dispose();
                    } catch (err) {
                        this._log.warn(err, `Error disposing request executor.`);
                    }
                });
            })
            .finally(() => this.emit("executorsDisposed"));
    }

    /**
     * Opens document session.
     * 
     * @returns {IDocumentSession} 
     * @memberof DocumentStore
     */
    public openSession(): IDocumentSession;

    /**
     * Opens document session.
     * 
     * @param {string} database 
     * @returns {IDocumentSession} 
     * @memberof DocumentStore
     */
    public openSession(database: string): IDocumentSession;

    /**
     * Opens document session
     * 
     * @param {ISessionOptions} sessionOpts 
     * @returns {IDocumentSession} 
     * @memberof DocumentStore
     */
    public openSession(sessionOpts: ISessionOptions): IDocumentSession;
    public openSession(databaseOrSessionOptions?: string | ISessionOptions): IDocumentSession  {
        this._assertInitialized();
        this._ensureNotDisposed();

        if (typeof(databaseOrSessionOptions) === "string") {
            return this.openSession({ 
                database: (databaseOrSessionOptions as string) 
            });
        }

        let database: string;
        let sessionOpts: ISessionOptions;
        let requestExecutor: RequestExecutor;
        databaseOrSessionOptions = databaseOrSessionOptions || {};
        database = databaseOrSessionOptions.database || this._database;
        sessionOpts = databaseOrSessionOptions as ISessionOptions;
        requestExecutor = sessionOpts.requestExecutor || this.getRequestExecutor(database);

        const sessionId = uuid();
        const session = new DocumentSession(database, this, sessionId, requestExecutor);
        this._registerEvents(session);
        this.emit("sessionCreated", { session });
        return session;
    }

    /**
     * Gets request executor for specific database. Default is initial database.
     * 
     * @param {string} [database] 
     * @returns {RequestExecutor} 
     * @memberof DocumentStore
     */
    public getRequestExecutor(database?: string): RequestExecutor {
        this._assertInitialized();

        if (!database) {
            database = this.database;
        }

        const databaseLower = database.toLowerCase();

        let executor = this._requestExecutors.get(databaseLower);
        if (executor) {
            return executor;
        }

        if (!this.conventions.disableTopologyUpdates) {
            executor = RequestExecutor.create(this.urls, database, { 
                authOptions: this.authOptions, 
                documentConventions: this.conventions
            });
        } else {
            executor = RequestExecutor.createForSingleNodeWithConfigurationUpdates(
              this.urls[0], database, { 
                  authOptions: this.authOptions, 
                  documentConventions: this.conventions
              });
        }

        this._log.info(`New request executor for datebase ${database}`);
        this._requestExecutors.set(databaseLower, executor);

        return executor;
    }

    /**
     * Initializes this instance.
     */
    public initialize(): IDocumentStore {
        if (this._initialized) {
            return this;
        }

        this._assertValidConfiguration();

        try {
            if (!this.conventions.documentIdGenerator) { // don't overwrite what the user is doing
                const generator = new HiloMultiDatabaseIdGenerator(this);
                this._multiDbHiLo = generator;

                this.conventions.documentIdGenerator = 
                    (dbName: string, entity: object) => generator.generateDocumentId(dbName, entity);
            }

            this.conventions.freeze();
            this._initialized = true;
        } catch (e) {
            this.dispose();
            throw e;
        }

        return this;
    }

    /**
     * Validate the configuration for the document store
     */
    protected _assertValidConfiguration(): void {
        if (!this._urls || !this._urls.length) {
            throwError("InvalidArgumentException", "Document store URLs cannot be empty");
        }

        super._assertValidConfiguration();
    }

    /**
     * Setup the context for no aggressive caching
     *
     * This is mainly useful for internal use inside RavenDB, when we are executing
     * queries that have been marked with WaitForNonStaleResults, we temporarily disable
     * aggressive caching.
     * 
     * @returns {IDisposable} 
     * @memberof DocumentStore
     */
    public disableAggressiveCaching(): IDisposable;

    /**
     * Setup the context for no aggressive caching
     *
     * This is mainly useful for internal use inside RavenDB, when we are executing
     * queries that have been marked with WaitForNonStaleResults, we temporarily disable
     * aggressive caching.
     * 
     * @param {string} database 
     * @returns {IDisposable} 
     * @memberof DocumentStore
     */
    public disableAggressiveCaching(): IDisposable;
    public disableAggressiveCaching(database: string): IDisposable;
    public disableAggressiveCaching(database?: string): IDisposable {
        this._assertInitialized();
        const re: RequestExecutor = this.getRequestExecutor(database || this.database);
        const old = re.aggressiveCaching;
        re.aggressiveCaching = null;
        const dispose = () => re.aggressiveCaching = old;

        return { dispose };
    }

    public changes(): IDatabaseChanges;
    public changes(database: string): IDatabaseChanges;
    public changes(database?: string): IDatabaseChanges {
        this._assertInitialized();

        const targetDatabase = (database || this.database).toLocaleLowerCase();
        if (this._databaseChanges.has(targetDatabase)) {
            return this._databaseChanges.get(targetDatabase);
        }

        const newChanges = this._createDatabaseChanges(targetDatabase);
        this._databaseChanges.set(targetDatabase, newChanges);
        return newChanges;
    }

    protected _createDatabaseChanges(database: string) {
        return new DatabaseChanges(this.getRequestExecutor(database), database,
            () => this._databaseChanges.delete(database));
    }

    public getLastDatabaseChangesStateException(): Error;
    public getLastDatabaseChangesStateException(database: string): Error;
    public getLastDatabaseChangesStateException(database?: string): Error {
        const databaseChanges = this._databaseChanges.get(database || this.database) as DatabaseChanges;
        if (databaseChanges) {
            return databaseChanges.lastConnectionStateException;
        }

        return null;
    }

    // TBD public override IDatabaseChanges Changes(string database = null)
    // TBD protected virtual IDatabaseChanges CreateDatabaseChanges(string database)
    // TBD public override IDisposable AggressivelyCacheFor(TimeSpan cacheDuration, string database = null)
    // TBD private void ListenToChangesAndUpdateTheCache(string database)

    /**
     * Gets maintenance operations executor.
     * 
     * @readonly
     * @type {MaintenanceOperationExecutor}
     * @memberof DocumentStore
     */
    public get maintenance(): MaintenanceOperationExecutor {
        this._assertInitialized();

        if (!this._maintenanceOperationExecutor) {
            this._maintenanceOperationExecutor = new MaintenanceOperationExecutor(this);
        }

        return this._maintenanceOperationExecutor;
    }

    /**
     * Gets operations executor.
     * 
     * @readonly
     * @type {OperationExecutor}
     * @memberof DocumentStore
     */
    public get operations(): OperationExecutor {
        if (!this._operationExecutor) {
            this._operationExecutor = new OperationExecutor(this);
        }

        return this._operationExecutor;
    }

    public bulkInsert(): BulkInsertOperation;
    public bulkInsert(database: string): BulkInsertOperation;
    public bulkInsert(database?: string): BulkInsertOperation {
        this._assertInitialized();

        return new BulkInsertOperation(database || this.database, this);
    }
}
