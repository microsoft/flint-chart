declare module 'plotly.js-dist-min' {
  const Plotly: {
    newPlot: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<unknown>;
    purge: (el: HTMLElement) => void;
  };
  export default Plotly;
}
