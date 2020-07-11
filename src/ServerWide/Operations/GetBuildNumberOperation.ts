import { DocumentConventions, IServerOperation, OperationResultType, RavenCommand, ServerNode } from "../..";
import { BuildNumber } from "./BuildNumber";
import { HttpRequestParameters } from "../../Primitives/Http";
import * as stream from "stream";

export class GetBuildNumberOperation implements IServerOperation<BuildNumber> {
    getCommand(conventions: DocumentConventions): RavenCommand<BuildNumber> {
        return new GetBuildNumberCommand();
    }

    public get resultType(): OperationResultType {
        return "CommandResult";
    }
}

class GetBuildNumberCommand extends RavenCommand<BuildNumber> {
    get isReadRequest(): boolean {
        return true;
    }

    createRequest(node: ServerNode): HttpRequestParameters {
        const uri = node.url + "/build/version";

        return {
            uri,
            method: "GET"
        }
    }

    async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        return this._parseResponseDefaultAsync(bodyStream);
    }
}