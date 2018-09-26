import {IDocumentSession, ISessionOptions} from "./Session/IDocumentSession";
import { IStoreAuthOptions } from "../Auth/AuthOptions";
import { 
    SessionBeforeStoreEventArgs, 
    SessionAfterSaveChangesEventArgs, 
    SessionBeforeQueryEventArgs, 
    SessionBeforeDeleteEventArgs 
} from "./Session/SessionEvents";
import { IDisposable } from "../Types/Contracts";
import { Todo } from "../Types";
import { MaintenanceOperationExecutor } from "./Operations/MaintenanceOperationExecutor";
import { OperationExecutor} from "./Operations/OperationExecutor";
import { AbstractIndexCreationTask } from "./Indexes";
import { RequestExecutor } from "../Http/RequestExecutor";
import { DocumentConventions } from "./Conventions/DocumentConventions";
import { InMemoryDocumentSessionOperations } from "./Session/InMemoryDocumentSessionOperations";
import {BulkInsertOperation} from "./BulkInsertOperation";
import {IDatabaseChanges} from "./Changes/IDatabaseChanges";

export interface SessionEventsProxy {
    addSessionListener(eventName: "beforeStore", eventHandler: (eventArgs: SessionBeforeStoreEventArgs) => void): this;
    addSessionListener(eventName: "afterSaveChanges", eventHandler: (eventArgs: Todo) => void): this;
    addSessionListener(eventName: "beforeQuery", eventHandler: (eventArgs: Todo) => void): this;
    addSessionListener(eventName: "beforeDelete", eventHandler: (eventArgs: Todo) => void): this;

    removeSessionListener(
      eventName: "beforeStore", eventHandler: (eventArgs: SessionBeforeStoreEventArgs) => void): void;
    removeSessionListener(
      eventName: "afterSaveChanges", eventHandler: (eventArgs: Todo) => void): void;
    removeSessionListener(
      eventName: "beforeQuery", eventHandler: (eventArgs: Todo) => void): void;
    removeSessionListener(
      eventName: "beforeDelete", eventHandler: (eventArgs: Todo) => void): void;
}

export type DocumentStoreEvent = "beforeDispose" | "afterDispose";

export interface SessionCreatedEventArgs {
    session: InMemoryDocumentSessionOperations;
}

export interface DocumentStoreEventEmitter {

    on(eventName: "sessionCreated", eventHandler: (args: SessionCreatedEventArgs) => void): this;
    on(eventName: "beforeDispose", eventHandler: () => void): this;
    on(eventName: "afterDispose", eventHandler: (callback: () => void) => void): this;
    on(eventName: "executorsDisposed", eventHandler: (callback: () => void) => void): this;

    once(eventName: "sessionCreated", eventHandler: (args: SessionCreatedEventArgs) => void): this;
    once(eventName: "beforeDispose", eventHandler: () => void): this;
    once(eventName: "afterDispose", eventHandler: (callback: () => void) => void): this;
    once(eventName: "executorsDisposed", eventHandler: (callback: () => void) => void): this;

    removeListener(eventName: "sessionCreated", eventHandler: (args: SessionCreatedEventArgs) => void): void;
    removeListener(eventName: "beforeDispose", eventHandler: () => void): void;
    removeListener(eventName: "afterDispose", eventHandler: (callback: () => void) => void): void;
    removeListener(eventName: "executorsDisposed", eventHandler: (callback: () => void) => void): void;
}
export interface IDocumentStore extends
    IDisposable,
    SessionEventsProxy,
    DocumentStoreEventEmitter {

    /**
     *
     * Opens document session
     * @param {string} [database]
     * @returns   {IDocumentSession}
     * @memberof IDocumentStore
     */
    openSession(database?: string): IDocumentSession;

    /**
     * Opens document session
     * @param {ISessionOptions} [options]
     * @returns {IDocumentSession}
     * @memberof IDocumentStore
     */
    openSession(options?: ISessionOptions): IDocumentSession;

    /**
     * Opens document session
     * @param {string} [database]
     * @param {ISessionOptions} [options]
     * @returns {IDocumentSession}
     * @memberof IDocumentStore
     */
    openSession(database?: string, options?: ISessionOptions): IDocumentSession;

    /**
     * Subscribe to change notifications from the server
     * @return Database changes object
     */
    changes(): IDatabaseChanges;

    /**
     * Subscribe to change notifications from the server
     * @param database Database name
     * @return Database changes object
     */
    changes(database: string): IDatabaseChanges;

    /**
     * Setup the context for aggressive caching.
     *
     * Aggressive caching means that we will not check the server to see whether the response
     * we provide is current or not, but will serve the information directly from the local cache
     * without touching the server.
     *
     * @param cacheDuration Specify the aggressive cache duration
     */
    aggressivelyCacheFor(cacheDuration: number);

    /**
     * Setup the context for aggressive caching.
     *
     * Aggressive caching means that we will not check the server to see whether the response
     * we provide is current or not, but will serve the information directly from the local cache
     * without touching the server.
     *
     * @param cacheDuration Specify the aggressive cache duration
     * @param database Database name
     */
    aggressivelyCacheFor(cacheDuration: number, database: string);

    /**
     * Setup the context for no aggressive caching
     *
     * Aggressive caching means that we will not check the server to see whether the response
     * we provide is current or not, but will serve the information directly from the local cache
     * without touching the server.
     * @returns Disposable context
     */
    disableAggressiveCaching(): IDisposable;

    /**
     * Setup the context for no aggressive caching
     *
     * Aggressive caching means that we will not check the server to see whether the response
     * we provide is current or not, but will serve the information directly from the local cache
     * without touching the server.
     * @param database Database name
     * @returns Disposable context
     */
    disableAggressiveCaching(database: string): IDisposable;

    identifier: string;

    /**
     * Initializes this instance.
     * @returns initialized store
     */
    initialize(): IDocumentStore;

    /**
     * Executes the index creation
     * @param task Index Creation task to use
     */
    executeIndex(task: AbstractIndexCreationTask): Promise<void>;

    /**
     * Executes the index creation
     * @param task Index Creation task to use
     * @param database Target database
     */
    executeIndex(task: AbstractIndexCreationTask, database: string): Promise<void>;

    /**
     * Executes the index creation
     * 
     * @param {AbstractIndexCreationTask[]} tasks 
     * @returns {Promise<void>} 
     * @memberof IDocumentStore
     */
    executeIndexes(tasks: AbstractIndexCreationTask[]): Promise<void>;

    /**
     * Executes the index creation
     *
     * @param {AbstractIndexCreationTask[]} tasks
     * @param database Database name
     * @returns {Promise<void>}
     * @memberof IDocumentStore
     */
    executeIndexes(tasks: AbstractIndexCreationTask[], database: string): Promise<void>;

    /**
     * Contains authentication information: client certificate data;
     * @returns Authentication options
     */
    authOptions: IStoreAuthOptions;

    /**
     * Gets the conventions
     * @return Document conventions
     */
    conventions: DocumentConventions;

    /**
     * Gets the URLs
     * @return Store urls
     */
    urls: string[];

    bulkInsert(database?: string): BulkInsertOperation;

    // TBD: IReliableSubscriptions Subscriptions { get; }

    database: string;

    getRequestExecutor(databaseName?: string): RequestExecutor;

    maintenance: MaintenanceOperationExecutor;

    operations: OperationExecutor;

    addSessionListener(
        eventName: "beforeStore", eventHandler: (eventArgs: SessionBeforeStoreEventArgs) => void): this;
    addSessionListener(
        eventName: "afterSaveChanges", eventHandler: (eventArgs: SessionAfterSaveChangesEventArgs) => void): this;
    addSessionListener(
        eventName: "beforeQuery", eventHandler: (eventArgs: SessionBeforeQueryEventArgs) => void): this;
    addSessionListener(
        eventName: "beforeDelete", eventHandler: (eventArgs: SessionBeforeDeleteEventArgs) => void): this;
}
