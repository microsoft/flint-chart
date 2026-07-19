import { McpAppMockup } from '../../components/McpAppMockup';

export function DevMcpUi() {
  return (
    <div className="dev-page">
      <header className="dev-page-heading">
        <p>Integration harness</p>
        <h1>MCP UI test</h1>
      </header>
      <McpAppMockup />
    </div>
  );
}