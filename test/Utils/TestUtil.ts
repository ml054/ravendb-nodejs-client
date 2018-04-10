// tslint:disable-next-line:no-var-requires
const why = require("why-is-node-running");

import "source-map-support/register";
import {IDisposable} from "../../src/Types/Contracts";
import { RavenTestDriver } from "../../src/TestDriver";
import { RavenServerLocator } from "../../src/TestDriver/RavenServerLocator";
import { getLogger } from "../../src/Utility/LogUtil";

//logOnUncaughtAndUnhandled();

function logOnUncaughtAndUnhandled() {
    process.on("unhandledRejection", (...args) => {
        // tslint:disable-next-line:no-console
        console.log(...args);
    });

    process.on("uncaughtException", (...args) => {
        // tslint:disable-next-line:no-console
        console.log(...args);
    });
}

class TestServiceLocator extends RavenServerLocator {
}

export class RemoteTestContext extends RavenTestDriver implements IDisposable {
    public static setupServer(): RemoteTestContext {
        return new RemoteTestContext(new TestServiceLocator(), null);
    }
}

export class RemoteSecuredTestContext extends RavenTestDriver {

    public static ENV_CERTIFICATE_PATH = "RAVENDB_TEST_CERTIFICATE_PATH";

    public withHttps() {
        return false;
    }

    public getCommandArguments() {
        return [];
    }
}

export let globalContext: RemoteTestContext;
setupRavenDbTestContext();

function setupRavenDbTestContext() {

    before(() => {
        // tslint:disable-next-line:no-console
        console.log("TESTS START");
        globalContext = RemoteTestContext.setupServer();
    });

    after(() => {
        globalContext.dispose();
        // tslint:disable-next-line:no-console
        console.log("TESTS DONE");
    });

    return context;
}
