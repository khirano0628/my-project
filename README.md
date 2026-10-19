# Azure Customer Service Agent

An AI assistant for general Microsoft Azure customer-service questions. It
provides safe troubleshooting guidance and directs account-specific, billing,
security, and outage cases to a human via Azure portal **Help + support**. It
searches Microsoft Learn (Learn MCP) and can run read-only Azure lookups scoped
to the `khiranoAOAI` resource group (Azure MCP). It does not open tickets,
access billing or other subscriptions, or
promise refunds. Do not share credentials or unredacted logs with it.

This project is configured for the existing `CustomerSupport2` Microsoft
Foundry project and `gpt-5.6-sol` model deployment. The implementation in
[main.py](src/agent-framework-agent-basic-responses/main.py) uses Agent
Framework's `FoundryChatClient` and serves the Responses protocol locally.
Run all `azd` commands from this directory, not its parent folder.

## Run locally

1. Install Python 3.13 (x64 on Windows ARM64) and
   [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. Sign in to the Azure CLI with `az login`. The signed-in identity needs a
   data-plane role such as **Foundry User** on the Foundry project (or its
   parent account); the Azure subscription **Owner** role alone does not
   grant model inference. Allow time for a newly assigned role to propagate.
3. In `src/agent-framework-agent-basic-responses`, create a local `.env`
   containing `FOUNDRY_PROJECT_ENDPOINT` for the existing project and
   `AZURE_AI_MODEL_DEPLOYMENT_NAME=gpt-5.6-sol`. The `.env` file is ignored
   by Git and by azd.
4. In the same directory run `uv sync --python 3.13`, followed by
   `uv run --no-sync python main.py`. The server listens on
   `http://localhost:8088`. Alternatively, open this project folder in
   VS Code and use **Debug Agent with Inspector**.
5. Use the Foundry Toolkit **Agent Inspector** on port 8088 to send a test
   question, such as an Azure billing dispute. Confirm that the assistant
   does not claim to issue a refund or create a ticket and instead directs
   the customer to a human support request.

If model inference returns HTTP 403, check the signed-in identity's data
roles and the Foundry resource's network access policy. Server startup alone
does not establish that the model call works.

## Deployment

The hosted agent `azure-customer-service-agent` is deployed to the existing
`CustomerSupport2` Foundry project. Version 4 is active (adds MCP tools). A remote billing
inquiry smoke test confirmed that it responds in Japanese, directs customers
to Azure billing support, and does not claim to issue refunds or create tickets.
Open the [agent in Foundry Playground](https://ai.azure.com/nextgen/r/vYkHK4s9QJi1uBFvoqEJkQ,khiranoAOAI,,CustomerSupport2-resource,CustomerSupport2/build/agents/azure-customer-service-agent/build?version=4)
to test it. Hosting creates billable compute.

### MCP tools

The agent reads one Foundry toolbox, `support-tools` (env `TOOLBOX_NAME` in
[azure.yaml](azure.yaml), spec in [toolbox.yaml](toolbox.yaml)), via
`FoundryToolbox`. It bundles two project connections:

- `learn-mcp`: `https://learn.microsoft.com/api/mcp`, no authentication.
- `azure-mcp`: a self-hosted Azure MCP Server on Azure Container Apps
  ([azure-mcp-server/](azure-mcp-server)), authenticated with the Foundry
  project managed identity (audience = the server's Entra app). It runs with
  `--read-only` and namespaces `group`, `resourcehealth`, `monitor` (the
  template allows at most three). Its managed identity has **Reader** on the
  `khiranoAOAI` resource group only.

Deploy the server with `azd provision` in `azure-mcp-server` (separate azd
environment; set `FOUNDRY_PROJECT_RESOURCE_ID`). Recreate the connections and
toolbox with `azd ai connection create` / `azd ai toolbox create`. The MCP tool
definitions are large, so the model deployment needs enough TPM (set to 100).
Never remove `--read-only` or disable the server's incoming auth.

Source-code deployment uses
`src/agent-framework-agent-basic-responses/requirements.txt`, exported with
pinned versions from the locally tested lock, for remote dependency restore
from PyPI. The local `uv.lock` references a package mirror and is excluded
from Git and the deployment package by `.agentignore`. Refresh the exported
requirements when the local lock changes. See the
[hosted-agent source-code deployment guide](https://learn.microsoft.com/azure/foundry/agents/how-to/deploy-hosted-agent-code)
for the workflow and required permissions.

## Chat UI (local)

The Japanese chat UI in [ui](ui/) calls the deployed hosted agent through a
local Node.js server. Azure credentials and access tokens stay on the server;
the browser never calls Foundry directly. This is a **local development UI**,
not a public web deployment or a multi-user authenticated service. The server
listens on `127.0.0.1` only. Do not expose or reverse-proxy it to the internet
without adding user authentication, authorization and rate limiting.

Install Node.js 20 or later, sign in to Azure CLI (`az login`) with an identity
that has **Foundry User** access to `CustomerSupport2`, then run from `ui`:

```text
npm install
npm start
```

Open `http://localhost:3000`. Send a question, use a suggested topic, or start
a new conversation. Chat history is held only in the browser tab; reloading
starts a new conversation. If necessary, set `FOUNDRY_AGENT_ENDPOINT` in the
server process to override the deployed agent's Responses URL. To run the
local UI tests, use `npm test`.

テスト用の説明文です。
