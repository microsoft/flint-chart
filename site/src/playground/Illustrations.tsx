import { ChatMockup } from '../routes/McpServer';
import { ChartRedesignFigure } from './ChartRedesignFigure';
import { SpecPipelineFigure } from '../components/SpecPipelineFigure';
import { DiverseChartWallIllustration } from './DiverseChartWallIllustration';
import { IllustrationPageHeader } from './IllustrationPageHeader';

export function Illustrations() {
  return (
    <div className="dev-page dev-page-figures">
      <IllustrationPageHeader active="gallery" />
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