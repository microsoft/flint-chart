import { ChatMockup } from '../McpServer';
import { ChartRedesignFigure } from '../../components/ChartRedesignFigure';
import { SpecPipelineFigure } from '../../components/SpecPipelineFigure';

export function DevIllustrations() {
  return (
    <div className="dev-page dev-page-figures">
      <header className="dev-page-heading">
        <p>Export surfaces</p>
        <h1>Illustrations</h1>
      </header>
      <ChartRedesignFigure />
      <SpecPipelineFigure />
      <section className="dev-figure-wide">
        <ChatMockup />
      </section>
    </div>
  );
}