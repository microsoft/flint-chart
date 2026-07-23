import { McpAppMockup } from '../components/McpAppMockup';

export function McpUi() {
  return (
    <div className="dev-page">
      <header className="dev-page-heading">
        <h1>MCP UI test</h1>
      </header>
      <McpAppMockup />
    </div>
  );
}