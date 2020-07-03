import { EtlConfiguration } from "./EtlConfiguration";
import { DocumentConventions, EtlType, RavenConnectionString } from "../../..";

export class RavenEtlConfiguration extends EtlConfiguration<RavenConnectionString> {
    public loadRequestTimeoutInSec: number;

    public get etlType(): EtlType {
        return "Raven";
    }

    serialize(conventions: DocumentConventions): object {
        const result = super.serialize(conventions) as any;
        result.EtlType = this.etlType;
        return result;
    }
}