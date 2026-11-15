import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface LabTab {
  id: string;
  label: string;
  element: ReactNode;
}

/** Several labs on one topic under one dev page: a tab bar (`?tab=<id>`) over the lab it picks; the first tab opens. */
export function TabbedLab({ tabs }: { tabs: LabTab[] }) {
  const [params, setParams] = useSearchParams();
  const current = tabs.find((tab) => tab.id === params.get('tab')) ?? tabs[0];
  return (
    <>
      <nav className="dev-lab-tabs" aria-label="Labs on this topic">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab === current ? 'is-on' : undefined}
            aria-current={tab === current ? 'page' : undefined}
            onClick={() => setParams(tab === tabs[0] ? {} : { tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div key={current.id}>{current.element}</div>
    </>
  );
}
