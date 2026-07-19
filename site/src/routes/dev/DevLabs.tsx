import { DodgeToggleFigure } from '../../components/DodgeToggleFigure';
import { LocalDodgeFigure } from '../../components/LocalDodgeFigure';

export function DevLabs() {
  return (
    <div className="dev-page">
      <header className="dev-page-heading">
        <h1>Labs</h1>
      </header>
      <DodgeToggleFigure />
      <LocalDodgeFigure />
    </div>
  );
}