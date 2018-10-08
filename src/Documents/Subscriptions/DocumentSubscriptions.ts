import { IDisposable } from "../../Types/Contracts";
import { DocumentStore } from "../DocumentStore";
import { SubscriptionCreationOptions } from "./SubscriptionCreationOptions";
import { DocumentType } from "../DocumentAbstractions";
import { TypeUtil } from "../../Utility/TypeUtil";
import { throwError } from "../../Exceptions";
import { CreateSubscriptionCommand } from "../Commands/CreateSubscriptionCommand";
import { SubscriptionWorkerOptions } from "./SubscriptionWorkerOptions";
import { Revision } from "./Revision";
import { SubscriptionState } from "./SubscriptionState";
import { SubscriptionWorker } from "./SubscriptionWorker";
import { DeleteSubscriptionCommand } from "../Commands/DeleteSubscriptionCommand";
import { StringUtil } from "../../Utility/StringUtil";
import { GetSubscriptionStateCommand } from "../Commands/GetSubscriptionStateCommand";
import { DropSubscriptionConnectionCommand } from "../Commands/DropSubscriptionConnectionCommand";
import { GetSubscriptionsCommand } from "../Commands/GetSubscriptionsCommand";

export class DocumentSubscriptions implements IDisposable {
    private readonly _store: DocumentStore;
    private readonly _subscriptions: Map<IDisposable, boolean> = new Map();

    public constructor(store: DocumentStore) {
        this._store = store;
    }

    /**
     * Creates a data subscription in a database. The subscription will expose all
     * documents that match the specified subscription options for a given type.
     */
    public async create(options: SubscriptionCreationOptions): Promise<string>;

    /**
     * Creates a data subscription in a database. The subscription will expose all
     * documents that match the specified subscription options for a given type.
     */
    public async create(options: SubscriptionCreationOptions, database: string): Promise<string>;

    /**
     * Creates a data subscription in a database. The subscription will expose all
     * documents that match the specified subscription options for a given type.
     */
    public async create(documentType: DocumentType): Promise<string>;

    /**
     * Creates a data subscription in a database. The subscription will expose all
     * documents that match the specified subscription options for a given type.
     */
    public async create(optionsOrDocumentType: SubscriptionCreationOptions | DocumentType,
                        database?: string): Promise<string> {

        let options: SubscriptionCreationOptions = null;
        if (TypeUtil.isDocumentType(optionsOrDocumentType)) {
            options = {
                documentType: optionsOrDocumentType as DocumentType<any>
            };
            return this.create(this._ensureCriteria(options, false), database);
        } else {
            options = optionsOrDocumentType as SubscriptionCreationOptions;
        }

        if (!options) {
            throwError("InvalidArgumentException", "Cannot create a subscription if options are null");
        }

        if (!options.query) {
            throwError("InvalidArgumentException", "Cannot create a subscription if the script is null");
        }

        const requestExecutor = this._store.getRequestExecutor(database || this._store.database);

        const command = new CreateSubscriptionCommand(this._store.conventions, options);
        await requestExecutor.execute(command);

        return command.result.name;
    }

    /**
     * Creates a data subscription in a database. The subscription will expose all documents
     * that match the specified subscription options for a given type.
     */
    public createForRevisions(options: SubscriptionCreationOptions): Promise<string>;

    /**
     * Creates a data subscription in a database. The subscription will expose all documents
     * that match the specified subscription options for a given type.
     */
    public createForRevisions(options: SubscriptionCreationOptions, database: string): Promise<string>;

    /**
     * Creates a data subscription in a database. The subscription will expose all documents
     * that match the specified subscription options for a given type.
     */
    public createForRevisions(options: SubscriptionCreationOptions, database?: string): Promise<string> {
        options = options || {} as SubscriptionCreationOptions;

        return this.create(this._ensureCriteria(options, true), database);
    }

    private _ensureCriteria<T extends object>(
        criteria: SubscriptionCreationOptions, revisions: boolean) {
        if (!criteria) {
            criteria = {} as SubscriptionCreationOptions;
        }

        const objectDescriptor = this._store.conventions.findEntityType(criteria.documentType);
        const collectionName = this._store.conventions.getCollectionNameForType(objectDescriptor);

        if (!criteria.query) {
            if (revisions) {
                criteria.query = "from " + collectionName + " (Revisions = true) as doc";
            } else {
                criteria.query = "from " + collectionName + " as doc";
            }
        }
        return criteria;
    }

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorker<T extends object>(
        options: SubscriptionWorkerOptions<T>): SubscriptionWorker<T>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorker<T extends object>(
        options: SubscriptionWorkerOptions<T>, database: string): SubscriptionWorker<T>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorker<T extends object>(
        subscriptionName: string): SubscriptionWorker<T>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorker<T extends object>(
        subscriptionName: string, database: string): SubscriptionWorker<T>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorker<T extends object>(
        optionsOrSubscriptionName: SubscriptionWorkerOptions<T> | string,
        database?: string): SubscriptionWorker<T> {

        if (TypeUtil.isString(optionsOrSubscriptionName)) {
            return this.getSubscriptionWorker({
                subscriptionName: optionsOrSubscriptionName
            }, database);
        }

        const options: SubscriptionWorkerOptions<T> = optionsOrSubscriptionName;
        this._store.assertInitialized();

        if (!options) {
            throwError("InvalidArgumentException", "Cannot open a subscription if options are null");
        }

        const subscription = new SubscriptionWorker(options, false, this._store, database);
        subscription.on("end", () => this._subscriptions.delete(subscription));
        this._subscriptions.set(subscription, true);

        return subscription;
    }

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorkerForRevisions<T extends object>(
        options: SubscriptionWorkerOptions<T>): SubscriptionWorker<Revision<T>>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorkerForRevisions<T extends object>(
        options: SubscriptionWorkerOptions<T>, database: string): SubscriptionWorker<Revision<T>>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorkerForRevisions<T extends object>(
        subscriptionName: string, documentType: DocumentType<T>): SubscriptionWorker<Revision<T>>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorkerForRevisions<T extends object>(
        subscriptionName: string, documentType: DocumentType<T>,
        database: string): SubscriptionWorker<Revision<T>>;

    /**
     * It opens a subscription and starts pulling documents since a last processed document for that subscription.
     * The connection options determine client and server cooperation rules like document batch sizes
     * or a timeout in a matter of which a client needs to acknowledge that batch has been processed.
     * The acknowledgment is sent after all documents are processed by subscription's handlers.
     *
     * There can be only a single client that is connected to a subscription.
     */
    public getSubscriptionWorkerForRevisions<T extends object>(
        optionsOrSubscriptionName: SubscriptionWorkerOptions<T> | string,
        documentTypeOrDatabase?: DocumentType<T> | string,
        database?: string): SubscriptionWorker<Revision<T>> {

        if (TypeUtil.isString(optionsOrSubscriptionName)) {
            return this.getSubscriptionWorkerForRevisions({
                subscriptionName: optionsOrSubscriptionName,
                documentType: documentTypeOrDatabase
            } as SubscriptionWorkerOptions<T>, database);
        }

        const options: SubscriptionWorkerOptions<T> = optionsOrSubscriptionName;
        database = documentTypeOrDatabase as string;
        const subscription = new SubscriptionWorker<Revision<T>>(
            options as any as SubscriptionWorkerOptions<Revision<T>>, true, this._store, database);

        subscription.on("end", () => this._subscriptions.delete(subscription));
        this._subscriptions.set(subscription, true);

        return subscription;
    }

    /**
     * It downloads a list of all existing subscriptions in a database.
     */
    public async getSubscriptions(start: number, take: number): Promise<SubscriptionState[]>;

    /**
     * It downloads a list of all existing subscriptions in a database.
     */
    public async getSubscriptions(start: number, take: number, database: string): Promise<SubscriptionState[]>;

    /**
     * It downloads a list of all existing subscriptions in a database.
     */
    public async getSubscriptions(start: number, take: number, database?: string): Promise<SubscriptionState[]> {
        const requestExecutor = this._store.getRequestExecutor(database || this._store.database);

        const command = new GetSubscriptionsCommand(start, take);
        await requestExecutor.execute(command);

        return command.result;
    }

    /**
     * Delete a subscription.
     */
    public async delete(name: string): Promise<void>;

    /**
     * Delete a subscription.
     */
    public async delete(name: string, database: string): Promise<void>;

    /**
     * Delete a subscription.
     */
    public async delete(name: string, database?: string): Promise<void> {
        const requestExecutor = this._store.getRequestExecutor(database || this._store.database);

        const command = new DeleteSubscriptionCommand(name);
        return requestExecutor.execute(command);
    }

    /**
     * Returns subscription definition and it's current state
     */
    public async getSubscriptionState(subscriptionName: string): Promise<SubscriptionState>;

    /**
     * Returns subscription definition and it's current state
     */
    public async getSubscriptionState(subscriptionName: string, database: string): Promise<SubscriptionState>;

    /**
     * Returns subscription definition and it's current state
     */
    public async getSubscriptionState(subscriptionName: string, database?: string): Promise<SubscriptionState> {
        if (StringUtil.isNullOrEmpty(subscriptionName)) {
            throwError("InvalidArgumentException", "SubscriptionName cannot be null");
        }

        const requestExecutor = this._store.getRequestExecutor(database || this._store.database);

        const command = new GetSubscriptionStateCommand(subscriptionName);
        await requestExecutor.execute(command);
        return command.result;
    }

    public dispose(): void {
        if (!this._subscriptions.size) {
            return;
        }

        this._subscriptions.forEach(((value, key) => key.dispose()));
    }

    /**
     * Force server to close current client subscription connection to the server
     */
    public async dropConnection(name: string): Promise<void>;

    /**
     * Force server to close current client subscription connection to the server
     */
    public async dropConnection(name: string, database: string): Promise<void>;

    /**
     * Force server to close current client subscription connection to the server
     */
    public async dropConnection(name: string, database?: string): Promise<void> {
        const requestExecutor = this._store.getRequestExecutor(database || this._store.database);

        const command = new DropSubscriptionConnectionCommand(name);
        return requestExecutor.execute(command);
    }
}
