import { ChatMockup } from '../routes/McpServer';
import { ChartRedesignFigure } from './ChartRedesignFigure';
import { SpecPipelineFigure } from '../components/SpecPipelineFigure';
import { DiverseChartWallIllustration } from './DiverseChartWallIllustration';

export function Illustrations() {
  return (
    <div className="dev-page dev-page-figures">
      <header className="dev-page-heading">
        <h1>Illustrations</h1>
      </header>
      <div style={{ width: 'min(100%, 1280px)' }}>
        <DiverseChartWallIllustration />
      </div>
      <ChartRedesignFigure />
      <SpecPipelineFigure />
      <section className="dev-figure-wide">
        <ChatMockup />
      </section>
    </div>
  );
}