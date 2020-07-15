import { throwError } from "../../Exceptions";
import { BatchOptions } from "./Batches/BatchOptions";
import { InMemoryDocumentSessionOperations } from "../Session/InMemoryDocumentSessionOperations";
import { DocumentConventions } from "../Conventions/DocumentConventions";
import { ClusterTransactionOperationsBase } from "../Session/ClusterTransactionOperationsBase";
import { DocumentInfo } from "../Session/DocumentInfo";

export type CommandType =
    "None"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "AttachmentPUT"
    | "AttachmentDELETE"
    | "AttachmentMOVE"
    | "AttachmentCOPY"
    | "CompareExchangePUT"
    | "CompareExchangeDELETE"
    | "ForceRevisionCreation"
    | "Counters"
    | "ClientAnyCommand"
    | "ClientModifyDocumentCommand"
    | "BatchPATCH"
    ;

export interface ICommandData {
    id: string;
    name: string;
    changeVector: string;
    type: CommandType;

    serialize(conventions: DocumentConventions): object;

    onBeforeSaveChanges?: (session: InMemoryDocumentSessionOperations) => void;
}

export class DeleteCommandData implements ICommandData {

    public id: string;
    public name: string;
    public changeVector: string;

    public get type(): CommandType {
        return "DELETE";
    }

    constructor(id: string, changeVector?: string) {
        this.id = id;
        if (!id) {
            throwError("InvalidArgumentException", "Id cannot be null or undefined.");
        }

        this.changeVector = changeVector;
    }

    public serialize(conventions: DocumentConventions): object {
        const result = {
            Id: this.id,
            ChangeVector: this.changeVector,
            Type: "DELETE"
        };

        this._serializeExtraFields(result);

        return result;
    }

    // tslint:disable-next-line:no-empty
    protected _serializeExtraFields(resultingObject: object) {}
}

export class PutCommandDataBase<T extends object> implements ICommandData {

    public get type(): CommandType {
        return "PUT";
    }

    public id: string;
    public name: string = null;
    public changeVector: string;

    private readonly _document: T;

    constructor(id: string, changeVector: string, document: T) {

        if (!document) {
            throwError("InvalidArgumentException", "Document cannot be null or undefined.");
        }

        this.id = id;
        this.changeVector = changeVector;
        this._document = document;
    }

    public serialize(conventions: DocumentConventions): object {
        return {
            Id: this.id,
            ChangeVector: this.changeVector,
            Document: this._document,
            Type: "PUT"
        };
    }
}

export class PutCommandDataWithJson extends PutCommandDataBase<object> {

    public constructor(id: string, changeVector: string, document: object, strategy: ForceRevisionStrategy) {
        super(id, changeVector, document, strategy);
    }
}

export class SaveChangesData {
    public deferredCommands: ICommandData[];
    public deferredCommandsMap: Map<string, ICommandData>;
    public sessionCommands: ICommandData[] = [];
    public entities: object[] = [];
    public options: BatchOptions;
    public onSuccess: ActionsToRunOnSuccess;

    public constructor(args: {
        deferredCommands: ICommandData[],
        deferredCommandsMap: Map<string, ICommandData>,
        options: BatchOptions,
        session: InMemoryDocumentSessionOperations
    }) {
        this.deferredCommands = args.deferredCommands;
        this.deferredCommandsMap = args.deferredCommandsMap;
        this.options = args.options;
        this.onSuccess = new ActionsToRunOnSuccess(args.session);
    }
}

export class ActionsToRunOnSuccess {

    private readonly _session: InMemoryDocumentSessionOperations;
    private readonly _documentsByIdToRemove: string[] = [];
    private readonly _documentsByEntityToRemove: object[] = [];
    private readonly _documentInfosToUpdate: [DocumentInfo, object][] = [];

    private _clusterTransactionOperations: ClusterTransactionOperationsBase;
    private _clearDeletedEntities: boolean;

    public constructor(session: InMemoryDocumentSessionOperations) {
        this._session = session;
    }

    public removeDocumentById(id: string) {
        this._documentsByIdToRemove.push(id);
    }

    public removeDocumentByEntity(entity: object) {
        this._documentsByEntityToRemove.push(entity);
    }

    public clearClusterTransactionOperations(clusterTransactionOperations: ClusterTransactionOperationsBase) {
        this._clusterTransactionOperations = clusterTransactionOperations;
    }

    public updateEntityDocumentInfo(documentInfo: DocumentInfo, document: object) {
        this._documentInfosToUpdate.push([documentInfo, document]);
    }

    public clearSessionStateAfterSuccessfulSaveChanges() {
        for (let id of this._documentsByIdToRemove) {
            this._session.documentsById.remove(id);
        }

        for (let entity of this._documentsByEntityToRemove) {
            this._session.documentsByEntity.delete(entity);
        }

        for (let [info, document] of this._documentInfosToUpdate) {
            info.newDocument = false;
            info.document = document;
        }

        if (this._clearDeletedEntities) {
            this._session.deletedEntities.clear();
        }

        if (this._clusterTransactionOperations) {
            this._clusterTransactionOperations.clear();
        }

        this._session.deferredCommands.length = 0;
        this._session.deferredCommandsMap.clear();
    }

    public clearDeletedEntities() {
        this._clearDeletedEntities = true;
    }
}