import { DodgeToggleFigure } from './DodgeToggleFigure';
import { LocalDodgeFigure } from './LocalDodgeFigure';
import { BandExpansionFigure } from './BandExpansionFigure';
import { ColorDecisionFigure } from './ColorDecisionFigure';

export function Labs() {
  return (
    <div className="dev-page">
      <header className="dev-page-heading">
        <h1>Labs</h1>
      </header>
      <ColorDecisionFigure />
      <BandExpansionFigure />
      <DodgeToggleFigure />
      <LocalDodgeFigure />
    </div>
  );
}