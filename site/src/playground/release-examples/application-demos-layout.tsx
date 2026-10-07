import { createContext, useContext, type ReactNode } from 'react';

export type DemoLayout = 'chart-panel' | 'panel-chart' | 'full';

export const DemoLayoutContext = createContext<DemoLayout>('full');

const PANEL_LABEL: Record<Exclude<DemoLayout, 'full'>, string> = {
  'chart-panel': 'External display',
  'panel-chart': 'External control',
};

export function Placeholder({ label }: { label: string }) {
  return <div className="app-demo-placeholder">{label}</div>;
}

export function DemoColumns({ chart, panel, panelTitle }: { chart: ReactNode; panel: ReactNode; panelTitle?: string }) {
  const context = useContext(DemoLayoutContext);
  const layout = context === 'full' ? 'chart-panel' : context;
  const title = panelTitle ?? PANEL_LABEL[layout];
  const chartColumn = <div className="app-demo-column app-demo-chart">
    <h4 className="app-demo-column-title">Chart</h4>
    <div className="app-demo-box">{chart}</div>
  </div>;
  const panelColumn = <aside className="app-demo-column app-demo-panel" aria-label={title}>
    <h4 className="app-demo-column-title">{title}</h4>
    <div className="app-demo-box" aria-live="polite">{panel}</div>
  </aside>;
  return <div className={`app-demo-columns app-demo-${layout}`}>
    {layout === 'chart-panel' ? <>{chartColumn}{panelColumn}</> : <>{panelColumn}{chartColumn}</>}
  </div>;
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="it-empty-state">{children}</div>;
}
