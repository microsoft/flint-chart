import { Link } from 'react-router-dom';

type IllustrationView = 'gallery' | 'diagrams';

export function IllustrationPageHeader({ active }: { active: IllustrationView }) {
  return (
    <header className="dev-page-heading illustration-page-heading">
      <h1>Illustrations</h1>
      <nav className="illustration-page-switch" aria-label="Illustration views">
        {active === 'gallery' ? (
          <span aria-current="page">Gallery</span>
        ) : (
          <Link to="../illustrations">Gallery</Link>
        )}
        {active === 'diagrams' ? (
          <span aria-current="page">Diagrams</span>
        ) : (
          <Link to="architecture">Diagrams</Link>
        )}
      </nav>
    </header>
  );
}
