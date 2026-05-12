import { CompanyOSClient } from "../typescript/dist/index.js";

const client = CompanyOSClient.fromEnv();
console.log(await client.health());

