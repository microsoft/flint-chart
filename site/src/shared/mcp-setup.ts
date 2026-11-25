/** The hosted Flint MCP endpoint, for clients that connect over HTTP. */
export const HOSTED_MCP_URL = 'https://flint.data-formulator.ai/mcp';

/** A request a reader pastes into their agent: it sets Flint up as an MCP server and draws a first chart. */
export const MCP_SETUP_PROMPT = `Help me set up Flint as an MCP server named "flint"!

1. Add it to my client config, using whichever option my client supports:
   - a local (stdio) server: npx -y flint-chart-mcp
   - the hosted server over HTTP: ${HOSTED_MCP_URL}
2. Verify the setup by listing the available Flint chart types.
3. Show me a fun first chart: how many moons each planet has, in a Flint theme you like.`;
