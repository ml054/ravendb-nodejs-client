import { throwError } from "../../Exceptions";

export interface TcpConnectionHeaderMessage {
    databaseName: string;
    sourceNodeTag: string;
    operation: OperationTypes;
    operationVersion: number;
    info: string;
}

export type OperationTypes =
    "None"
    | "Drop"
    | "Subscription"
    | "Replication"
    | "Cluster"
    | "Heartbeats"
    | "Ping"
    | "TestConnection";

export const NUMBER_OR_RETRIES_FOR_SENDING_TCP_HEADER = 2;

export const PING_BASE_LINE = -1;
export const NONE_BASE_LINE = -1;
export const DROP_BASE_LINE = -2;
export const HEARTBEATS_BASE_LINE = 20;
export const SUBSCRIPTION_BASE_LINE = 40;
export const TEST_CONNECTION_BASE_LINE = 50;

export const HEARTBEATS_TCP_VERSION = HEARTBEATS_BASE_LINE;
export const SUBSCRIPTION_TCP_VERSION = SUBSCRIPTION_BASE_LINE;
export const TEST_CONNECTION_TCP_VERSION = TEST_CONNECTION_BASE_LINE;

export class PingFeatures {
    public baseLine = true;
}

export class NoneFeatures {
    public baseLine = true;
}

export class DropFeatures {
    public baseLine = true;
}

export class SubscriptionFeatures {
    public baseLine = true;
}

export class HeartbeatsFeatures {
    public baseLine = true;
}

export class TestConnectionFeatures {
    public baseLine = true;
}

export class ReplicationFeatures {
    public baseLine = true;
    public missingAttachments: boolean;
}

export class SupportedFeatures {
    public readonly protocolVersion: number;

    public constructor(version: number) {
        this.protocolVersion = version;
    }

    public ping: PingFeatures;
    public none: NoneFeatures;
    public drop: DropFeatures;
    public subscription: SubscriptionFeatures;
    public heartbeats: HeartbeatsFeatures;
    public testConnection: TestConnectionFeatures;
}

const operationsToSupportedProtocolVersions = new Map<OperationTypes, number[]>();
const supportedFeaturesByProtocol = new Map<OperationTypes, Map<number, SupportedFeatures>>();

{
    operationsToSupportedProtocolVersions.set("Ping", [PING_BASE_LINE]);
    operationsToSupportedProtocolVersions.set("None", [NONE_BASE_LINE]);
    operationsToSupportedProtocolVersions.set("Drop", [DROP_BASE_LINE]);
    operationsToSupportedProtocolVersions.set("Subscription", [SUBSCRIPTION_BASE_LINE]);
    operationsToSupportedProtocolVersions.set("Heartbeats", [HEARTBEATS_BASE_LINE]);
    operationsToSupportedProtocolVersions.set("TestConnection", [TEST_CONNECTION_BASE_LINE]);

    const pingFeaturesMap = new Map<number, SupportedFeatures>();
    supportedFeaturesByProtocol.set("Ping", pingFeaturesMap);
    const pingFeatures = new SupportedFeatures(PING_BASE_LINE);
    pingFeatures.ping = new PingFeatures();
    pingFeaturesMap.set(PING_BASE_LINE, pingFeatures);

    const noneFeaturesMap = new Map<number, SupportedFeatures>();
    supportedFeaturesByProtocol.set("None", noneFeaturesMap);
    const noneFeatures = new SupportedFeatures(NONE_BASE_LINE);
    noneFeatures.none = new NoneFeatures();
    noneFeaturesMap.set(NONE_BASE_LINE, noneFeatures);

    const dropFeaturesMap = new Map<number, SupportedFeatures>();
    supportedFeaturesByProtocol.set("Drop", dropFeaturesMap);
    const dropFeatures = new SupportedFeatures(DROP_BASE_LINE);
    dropFeatures.drop = new DropFeatures();
    dropFeaturesMap.set(DROP_BASE_LINE, dropFeatures);

    const subscriptionFeaturesMap = new Map<number, SupportedFeatures>();
    supportedFeaturesByProtocol.set("Subscription", subscriptionFeaturesMap);
    const subscriptionFeatures = new SupportedFeatures(SUBSCRIPTION_BASE_LINE);
    subscriptionFeatures.subscription = new SubscriptionFeatures();
    subscriptionFeaturesMap.set(SUBSCRIPTION_BASE_LINE, subscriptionFeatures);

    const heartbeatsFeaturesMap = new Map<number, SupportedFeatures>();
    supportedFeaturesByProtocol.set("Heartbeats", heartbeatsFeaturesMap);
    const heartbeatsFeatures = new SupportedFeatures(HEARTBEATS_BASE_LINE);
    heartbeatsFeatures.heartbeats = new HeartbeatsFeatures();
    heartbeatsFeaturesMap.set(HEARTBEATS_BASE_LINE, heartbeatsFeatures);

    const testConnectionFeaturesMap = new Map<number, SupportedFeatures>();
    supportedFeaturesByProtocol.set("TestConnection", testConnectionFeaturesMap);
    const testConnectionFeatures = new SupportedFeatures(TEST_CONNECTION_BASE_LINE);
    testConnectionFeatures.testConnection = new TestConnectionFeatures();
    testConnectionFeaturesMap.set(TEST_CONNECTION_BASE_LINE, testConnectionFeatures);
}

export type SupportedStatus = "OutOfRange" | "NotSupported" | "Supported";

export function operationVersionSupported(
    operationType: OperationTypes, version: number, currentRef: (value: number) => void): SupportedStatus {
    currentRef(-1);

    const supportedProtocols = operationsToSupportedProtocolVersions.get(operationType);
    if (!supportedProtocols) {
        throwError("InvalidOperationException",
            "This is a bug. Probably you forgot to add '"
            + operationType + "' operation to the operationsToSupportedProtocolVersions map");
    }

    for (const current of supportedProtocols) {
        currentRef(current);

        if (current === version) {
            return "Supported";
        }

        if (current < version) {
            return "NotSupported";
        }
    }

    return "OutOfRange";
}

export function getOperationTcpVersion(operationType: OperationTypes, index: number) {
    // we don't check the if the index go out of range, since this is expected and means that we don't have
    switch (operationType) {
        case "Ping":
        case "None":
            return -1;
        case "Drop":
            return -2;
        case "Subscription":
        case "Replication":
        case "Cluster":
        case "Heartbeats":
        case "TestConnection":
            return operationsToSupportedProtocolVersions.get(operationType)[index];
        default:
            throwError("InvalidArgumentException", "Invalid operation type: " + operationType);
    }
}

export function getSupportedFeaturesFor(type: OperationTypes, protocolVersion: number) {
    const features = supportedFeaturesByProtocol.get(type).get(protocolVersion);
    if (!features) {
        throwError("InvalidArgumentException",
            type + "in protocol " + protocolVersion + " was not found in the features set");
    }
    return features;
}
