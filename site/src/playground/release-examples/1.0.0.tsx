import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WrappingShowcase } from '../WrappingShowcase';
import { AccessibilityShowcase } from '../AccessibilityShowcase';
import '../axis-label-lab.css';

export function ReleaseExamples100() {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const section = document.getElementById(hash.slice(1));
    section?.scrollIntoView({ block: 'start' });
    section?.focus({ preventScroll: true });
  }, [hash, key]);

  return <section className="axis-label-lab release-examples">
    <header className="axis-label-heading">
      <h1>Release 1.0.0</h1>
      <nav className="release-section-nav" aria-label="Release sections">
        <Link to="#accessible-navigation">Accessibility</Link>
        <Link to="#label-wrapping">Label Wrapping</Link>
      </nav>
    </header>
    <AccessibilityShowcase />
    <WrappingShowcase />
  </section>;
}