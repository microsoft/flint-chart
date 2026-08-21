declare module 'plotly.js-dist-min' {
  const Plotly: {
    newPlot: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<unknown>;
    react: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<unknown>;
    Plots: {
      resize: (el: HTMLElement) => Promise<unknown> | void;
    };
    purge: (el: HTMLElement) => void;
  };
  export default Plotly;
}
