import { IMaintenanceOperation, OperationResultType } from "../OperationAbstractions";
import { ClientConfiguration } from "./ClientConfiguration";
import { throwError } from "../../../Exceptions";
import { RavenCommand, RavenCommandResponseType } from "../../../Http/RavenCommand";
import { HttpRequestParameters } from "../../../Primitives/Http";
import { ServerNode } from "../../../Http/ServerNode";
import { HeadersBuilder } from "../../../Utility/HttpUtil";
import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { IRaftCommand } from "../../../Http/IRaftCommand";
import { RaftIdGenerator } from "../../../Utility/RaftIdGenerator";

export class PutClientConfigurationOperation implements IMaintenanceOperation<void> {
    private readonly _configuration: ClientConfiguration;

    public get resultType(): OperationResultType {
        return "CommandResult";
    }

    public constructor(configuration: ClientConfiguration) {

        if (!configuration) {
            throwError("InvalidArgumentException", "Configuration cannot be null or undefined.");
        }

        this._configuration = configuration;
    }

    public getCommand(conventions: DocumentConventions): RavenCommand<void> {
        return new PutClientConfigurationCommand(conventions, this._configuration);
    }

}

export class PutClientConfigurationCommand extends RavenCommand<void> implements IRaftCommand {
    private readonly _configuration: string;

    public get isReadRequest() {
        return false;
    }

    public get responseType(): RavenCommandResponseType {
        return "Empty";
    }

    public constructor(conventions: DocumentConventions, configuration: ClientConfiguration) {
        super();

        if (!conventions) {
            throwError("InvalidArgumentException", "Document conventions cannot be null or undefined.");
        }

        if (!configuration) {
            throwError("InvalidArgumentException", "Configuration cannot be null or undefined.");
        }

        this._configuration = this._serializer.serialize(configuration);
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uri = `${node.url}/databases/${node.database}/admin/configuration/client`;
        return {
            method: "PUT",
            uri,
            body: this._configuration,
            headers: HeadersBuilder.create()
                .typeAppJson()
                .build()
        };
    }

    public getRaftUniqueRequestId(): string {
        return RaftIdGenerator.newId();
    }
}
