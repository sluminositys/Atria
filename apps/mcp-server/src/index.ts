#!/usr/bin/env node
import { startAtriaMcpServer } from "@atria/mcp/server";

await startAtriaMcpServer(process.env.ATRIA_WORKSPACE);

