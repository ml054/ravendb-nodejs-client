import { RequestExecutor } from "../../Http/RequestExecutor";
import { ServerNode } from "../../Http/ServerNode";
import { ICommandData } from "../Commands/CommandData";
import { DocumentType } from "../DocumentAbstractions";
import { IDocumentStore } from "../IDocumentStore";
import { DocumentsChanges } from "./DocumentsChanges";
import { EntityToJson } from "./EntityToJson";
import { SessionLoadStartingWithOptions } from "./IDocumentSession";
import { IMetadataDictionary } from "./IMetadataDictionary";
import { IRawDocumentQuery } from "./IRawDocumentQuery";
import { SessionEventsEmitter } from "./SessionEvents";
import { IDocumentQuery } from "./IDocumentQuery";
import { AdvancedDocumentQueryOptions } from "./QueryOptions";
import { AbstractCallback } from "../../Types/Callbacks";
import { IAttachmentsSessionOperations } from "../Session/IAttachmentsSessionOperations";
import {ILazySessionOperations} from "./Operations/Lazy/ILazySessionOperations";
import {IEagerSessionOperations} from "./Operations/Lazy/IEagerSessionOperations";

export interface IAdvancedSessionOperations extends IAdvancedDocumentSessionOperations {

    eagerly: IEagerSessionOperations;
    lazily: ILazySessionOperations;

    // TBD IRevisionsSessionOperations Revisions { get; }

    /**
     * Updates entity with latest changes from server
     * @param <T> entity class
     * @param entity Entity to refresh
     */
    refresh<TEntity extends object>(entity: TEntity): Promise<void>;

    /**
     * Query the specified index using provided raw query
     * @param <T> result class
     * @param clazz result class
     * @param query Query
     * @return Raw document query
     */
    
    rawQuery<TResult extends object>(query: string, documentType?: DocumentType<TResult>): IRawDocumentQuery<TResult>;

    exists(id: string): Promise<boolean>;

    loadStartingWith<T extends object>(
        idPrefix: string, opts: SessionLoadStartingWithOptions<T>, callback?: AbstractCallback<T[]>): Promise<T[]>;
    loadStartingWith<T extends object>(
        idPrefix: string, callback?: AbstractCallback<T[]>): Promise<T[]>;

    documentQuery<TEntity extends object>(opts: AdvancedDocumentQueryOptions<TEntity>): IDocumentQuery<TEntity>;
    documentQuery<TEntity extends object>(documentType: DocumentType<TEntity>): IDocumentQuery<TEntity>;

    // tslint:disable:max-line-length
    // TBD void LoadStartingWithIntoStream(string idPrefix, Stream output, string matches = null, int start = 0, int pageSize = 25, string exclude = null, string startAfter = null);
    // TBD void LoadIntoStream(IEnumerable<string> ids, Stream output);
    // TBD List<T> MoreLikeThis<T, TIndexCreator>(string documentId) where TIndexCreator : AbstractIndexCreationTask, new();
    // TBD List<T> MoreLikeThis<T, TIndexCreator>(MoreLikeThisQuery query) where TIndexCreator : AbstractIndexCreationTask, new();
    // TBD List<T> MoreLikeThis<T>(string index, string documentId);
    // TBD List<T> MoreLikeThis<T>(MoreLikeThisQuery query);
    // TBD patch API void Increment<T, U>(T entity, Expression<Func<T, U>> path, U valToAdd);
    // TBD patch API void Increment<T, U>(string id, Expression<Func<T, U>> path, U valToAdd);
    // TBD patch API void Patch<T, U>(string id, Expression<Func<T, U>> path, U value);
    // TBD patch API void Patch<T, U>(T entity, Expression<Func<T, U>> path, U value);
    // TBD patch API void Patch<T, U>(T entity, Expression<Func<T, IEnumerable<U>>> path, Expression<Func<JavaScriptArray<U>, object>> arrayAdder);
    // TBD patch API void Patch<T, U>(string id, Expression<Func<T, IEnumerable<U>>> path, Expression<Func<JavaScriptArray<U>, object>> arrayAdder);

    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(IQueryable<T> query);
    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(IQueryable<T> query, out StreamQueryStatistics streamQueryStats);
    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(IDocumentQuery<T> query);
    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(IRawDocumentQuery<T> query);
    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(IRawDocumentQuery<T> query, out StreamQueryStatistics streamQueryStats);
    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(IDocumentQuery<T> query, out StreamQueryStatistics streamQueryStats);
    // TBD stream IEnumerator<StreamResult<T>> Stream<T>(string startsWith, string matches = null, int start = 0, int pageSize = int.MaxValue, string startAfter = null);
    // TBD stream void StreamInto<T>(IDocumentQuery<T> query, Stream output);
    // TBD stream void StreamInto<T>(IRawDocumentQuery<T> query, Stream output);
    // tslint:enable:max-line-length
}

export interface ReplicationBatchOptions {
    timeout?: number;
    throwOnTimeout?: boolean;
    replicas?: number;
    majority?: boolean;
}

export interface IndexBatchOptions {
    timeout?: number;
    throwOnTimeout?: boolean;
    indexes?: string[];
}

export interface IAdvancedDocumentSessionOperations extends SessionEventsEmitter {

    /**
     * The document store associated with this session
     * @return Document store
     */
    documentStore: IDocumentStore;

    /**
     * Allow extensions to provide additional state per session
     * @return External state
     */
    externalState: Map<string, object>;

    getCurrentSessionNode(): Promise<ServerNode>;

    requestExecutor: RequestExecutor;

    /**
     * Gets a value indicating whether any of the entities tracked by the session has changes.
     * @return true if any entity associated with session has changes
     */
    hasChanges(): boolean;

    maxNumberOfRequestsPerSession: number;

    /**
     * Gets the number of requests for this session
     * @return Number of requests issued on this session
     */
    numberOfRequests: number;
    /**
     * Gets the store identifier for this session.
     * The store identifier is the identifier for the particular RavenDB instance.
     * @return Store identifier
     */
    storeIdentifier: string;

    /**
     * Gets value indicating whether the session should use optimistic concurrency.
     * When set to true, a check is made so that a change made behind the session back would fail
     * and raise ConcurrencyException
     * @return true if optimistic concurrency should be used
     */
    useOptimisticConcurrency: boolean;

    /**
     * Clears this instance.
     * Remove all entities from the delete queue and stops tracking changes for all entities.
     */
    clear(): void;

    /**
     * Defer commands to be executed on saveChanges()
     * @param commands Commands to defer
     */
    defer(...commands: ICommandData[]): void;

    /**
     * Evicts the specified entity from the session.
     * Remove the entity from the delete queue and stops tracking changes for this entity.
     * @param <T> entity class
     * @param entity Entity to evict
     */
    evict<TEntity extends object>(entity: TEntity): void;

    /**
     * Gets the document id for the specified entity.
     *
     *  This function may return null if the entity isn't tracked by the session, or if the entity is
     *   a new entity with an ID that should be generated on the server.
     * @param entity Entity to get id from
     * @return document id
     */
    getDocumentId(entity: object): string;

    /**
     * Gets the metadata for the specified entity.
     * If the entity is transient, it will load the metadata from the store
     * and associate the current state of the entity with the metadata from the server.
     * @param <T> class of instance
     * @param instance instance to get metadata from
     * @return Entity metadata
     */
    getMetadataFor<T extends object>(instance: T): IMetadataDictionary;

    /**
     * Gets change vector for the specified entity.
     * If the entity is transient, it will load the metadata from the store
     * and associate the current state of the entity with the metadata from the server.
     * @param <T> Class of instance
     * @param instance Instance to get metadata from
     * @return Change vector
     */
    getChangeVectorFor<T extends object>(instance: T): string;

    /**
     * Gets last modified date for the specified entity.
     * If the entity is transient, it will load the metadata from the store
     * and associate the current state of the entity with the metadata from the server.
     * @param instance Instance to get last modified date from
     * @param <T> Class of instance
     * @return Last modified date
     */
    getLastModifiedFor<T extends object>(instance: T): Date;

    /**
     * Determines whether the specified entity has changed.
     * @param entity Entity to check
     * @return true if entity has changed
     */
    hasChanged(entity: object): boolean;

    /**
     * Returns whether a document with the specified id is loaded in the
     * current session
     * @param id Id of document
     * @return true is entity is loaded in session
     */
    isLoaded(id: string): boolean;

    /**
     * Mark the entity as one that should be ignore for change tracking purposes,
     * it still takes part in the session, but is ignored for SaveChanges.
     * @param entity Entity for which changed should be ignored
     */
    ignoreChangesFor(entity: object): void;

    /**
     * Returns all changes for each entity stored within session. 
     * Including name of the field/property that changed, its old and new value and change type.
     * @return Document changes
     */
    whatChanged(): { [id: string]: DocumentsChanges[] };

    /**
     * SaveChanges will wait for the changes made to be replicates to `replicas` nodes
     */
    waitForReplicationAfterSaveChanges();
    waitForReplicationAfterSaveChanges(opts: ReplicationBatchOptions);

    /**
     * SaveChanges will wait for the indexes to catch up with the saved changes
     */
    waitForIndexesAfterSaveChanges();
    waitForIndexesAfterSaveChanges(opts: IndexBatchOptions);

    entityToJson: EntityToJson;

    /**
     * @return Access the attachments operations
     */
    attachments: IAttachmentsSessionOperations;
}
