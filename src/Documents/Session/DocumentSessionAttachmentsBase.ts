import { AdvancedSessionExtensionBase } from "./AdvancedSessionExtensionBase";
import { AttachmentName } from "./../Attachments/index";
import { AttachmentData } from "./../Attachments/index";
import { CONSTANTS } from "./../../Constants";
import { InMemoryDocumentSessionOperations } from "./InMemoryDocumentSessionOperations";
import { AttachmentName } from "../Attachments";
import { StringUtil } from "../../Utility/StringUtil";
import { throwError } from "../../Exceptions";
import { IdTypeAndName } from "../IdTypeAndName";
import { DocumentInfo } from "./DocumentInfo";

export abstract class DocumentSessionAttachmentsBase extends AdvancedSessionExtensionBase {
    protected constructor(session: InMemoryDocumentSessionOperations) {
        super(session);
    }

     public getNames(entity: Object): AttachmentName[] {
        if (!entity) {
            return [];
        }

        const document = this._documentsByEntity.get(entity);
        if (!document) {
            return [];
        }

        const results = document.metadata[CONSTANTS.Documents.Metadata.ATTACHMENTS] as AttachmentName[];
        return results || [];
    }

    public store(documentId: string, name: string, stream: AttachmentData): void; 
    public store(documentId: string, name: string, stream: AttachmentData, contentType: string): void;
    public store(entity: object, name: string, stream: AttachmentData): void;
    public store(entity: object, name: string, stream: AttachmentData, contentType: string): void;
    public store(
        documentIdOrEntity: string | object, 
        name: string, 
        stream: AttachmentData, 
        contentType: string = null): void {
        
        if (typeof documentIdOrEntity === "object") {
            return this._storeAttachmentByEntity(documentIdOrEntity, name, stream, contentType);
        }
        
        if (StringUtil.isWhitespace(documentIdOrEntity)) {
            throwError("InvalidArgumentException", "DocumentId cannot be null");
        }

        if (StringUtil.isWhitespace(name)) {
            throwError("InvalidArgumentException", "Name cannot be null");
        }

        if (this._deferredCommandsMap.has(IdTypeAndName.keyFor(documentIdOrEntity, "DELETE", null))) {
            throwError("InvalidOperationException",
                "Cannot store attachment" + name 
                + " of document " + documentIdOrEntity 
                + ", there is a deferred command registered for this document to be deleted");
        }
        
        if (this._deferredCommandsMap.has(IdTypeAndName.keyFor(documentIdOrEntity, "AttachmentPUT", name))) {
            throwError("InvalidOperationException", 
                "Cannot store attachment" + name + " of document " 
                + documentIdOrEntity 
                + ", there is a deferred command registered to create an attachment with the same name.");
        }

        if (this._deferredCommandsMap.has(IdTypeAndName.keyFor(documentIdOrEntity, "AttachmentDELETE", name))) {
            throwError("InvalidOperationException", 
                "Cannot store attachment" + name + " of document " 
                + documentIdOrEntity 
                + ", there is a deferred command registered to delete an attachment with the same name.");
        }

        const documentInfo: DocumentInfo = this._documentsById.getValue(documentIdOrEntity);
        if (documentInfo && this._deletedEntities.has(documentInfo.entity)) {
            throwError("InvalidOperationException", 
                "Cannot store attachment " + name + " of document " 
                + documentIdOrEntity + ", the document was already deleted in this session.");
        }
        
        this.defer(new PutAttachmentCommandData(documentIdOrEntity, name, stream, contentType, null));
    }
    
    private _storeAttachmentByEntity(
        entity: object, name: string, stream: AttachmentData, contentType: string): void {
        const document: DocumentInfo = this._documentsByEntity.get(entity);
        if (!document) {
            this._throwEntityNotInSession(entity);
        }

        return this.store(document.id, name, stream, contentType);
    }

     protected _throwEntityNotInSession(entity: object): never {
        return throwError("InvalidArgumentException", 
            entity + " is not associated with the session, cannot add attachment to it. "
            + "Use documentId instead or track the entity in session.");
    }

    private _deleteAttachmentByEntity(entity: object, name: string): void {
        const document: DocumentInfo = this._documentsByEntity.get(entity);
        if (!document) {
            this._throwEntityNotInSession(entity);
        }

        return this.delete(document.id, name);
    }

    public delete(documentId: string, name: string): void {
        if (StringUtil.isWhitespace(documentId)) {
            throwError("InvalidArgumentException", "DocumentId cannot be null");
        }

        if (StringUtil.isWhitespace(name)) {
            throwError("InvalidArgumentException", "Name cannot be null");
        }
        
        if (this._deferredCommandsMap.has(IdTypeAndName.keyFor(documentId, "DELETE", null)) ||
                this._deferredCommandsMap.has(IdTypeAndName.keyFor(documentId, "AttachmentDELETE", name))) {
            return; // no-op
        }

        const documentInfo = this._documentsById.getValue(documentId);
        if (documentInfo && this._deletedEntities.has(documentInfo.entity)) {
            return;  //no-op
        }

        if (this._deferredCommandsMap.has(IdTypeAndName.keyFor(documentId, "AttachmentPUT", name))) {
            throwError("InvalidOperationException", 
                "Cannot delete attachment " + name + " of document " 
                + documentId + ", there is a deferred command registered to create an attachment with the same name.");
        }
        
        this.defer(new DeleteAttachmentCommandData(documentId, name, null));
    }
 }
