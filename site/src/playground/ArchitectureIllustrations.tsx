import { CompilationProcessIllustration } from './CompilationProcessIllustration';
import { IllustrationPageHeader } from './IllustrationPageHeader';
import { InteractionArchitectureIllustration } from './InteractionArchitectureIllustration';
import './architecture-illustrations.css';

export function ArchitectureIllustrations() {
  return (
    <div className="dev-page architecture-page">
      <IllustrationPageHeader active="diagrams" />

      <section className="architecture-section" aria-label="Compilation architecture">
        <CompilationProcessIllustration />
      </section>

      <section className="architecture-section" aria-label="Interaction architecture">
        <InteractionArchitectureIllustration />
      </section>
    </div>
  );
}