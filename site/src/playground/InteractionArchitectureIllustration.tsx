import { useId } from 'react';

const layout = {
  canvasWidth: 1943,
  margin: 42,
  gap: 28,
  inset: 18,
  centeredTextOffset: 6,
  artifactTitleOffset: 28,
  artifactDetailOffset: 51,
  artifactLineGap: 21,
  detailedArtifactHeight: 136,
  width: {
    input: 196,
    resolve: 248,
    dispatch: 254,
    canvasEvent: 292,
    externalEvent: 220,
    update: 242,
    group: 252,
    compactProcess: 223,
    baseState: 186,
    output: 198,
  },
  height: {
    input: 82,
    compact: 64,
    standard: 72,
    prominent: 92,
  },
} as const;

const column = {
  input: layout.margin,
  canvasProcess: layout.margin + layout.width.input + layout.gap,
  canvasEvent: layout.margin + layout.width.input + layout.gap + layout.width.resolve + layout.gap,
  externalProcess: layout.margin + layout.width.input + layout.gap,
  externalEvent: layout.margin + layout.width.input + layout.gap + layout.width.dispatch + layout.gap,
  handler: layout.margin + layout.width.input + layout.gap + layout.width.resolve + layout.gap + layout.width.canvasEvent + layout.gap * 2,
  update: layout.margin + layout.width.input + layout.gap + layout.width.resolve + layout.gap + layout.width.canvasEvent + layout.gap * 2 + layout.width.group + layout.gap,
  apply: layout.margin + layout.width.input + layout.gap + layout.width.resolve + layout.gap + layout.width.canvasEvent + layout.gap * 2 + layout.width.group + layout.gap + layout.width.update + layout.gap,
  output: layout.canvasWidth - layout.margin - layout.width.output,
} as const;

const centeredY = (center: number, height: number): number => center - height / 2;

function Box({ x, y, width, height, title, detail, className }: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <g className={`iai-box${className ? ` ${className}` : ''}`}>
      <rect x={x} y={y} width={width} height={height} />
      <text x={x + width / 2} y={detail ? y + 32 : y + height / 2 + layout.centeredTextOffset} textAnchor="middle" className="iai-title">{title}</text>
      {detail && <text x={x + width / 2} y={y + 56} textAnchor="middle" className="iai-detail">{detail}</text>}
    </g>
  );
}

function ItemBox({ x, y, width, height, title, detail }: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail?: string | readonly string[];
}) {
  const details = typeof detail === 'string' ? [detail] : detail;

  return (
    <g className="iai-item">
      <rect x={x} y={y} width={width} height={height} />
      <text
        x={details ? x + layout.inset : x + width / 2}
        y={details ? y + layout.artifactTitleOffset : y + height / 2 + layout.centeredTextOffset}
        textAnchor={details ? 'start' : 'middle'}
        className="iai-item-title"
      >
        {title}
      </text>
      {details?.map((line, index) => (
        <text key={line} x={x + layout.inset} y={y + layout.artifactDetailOffset + index * layout.artifactLineGap} className="iai-item-detail">{line}</text>
      ))}
    </g>
  );
}

interface DetailLine {
  text: string;
  emphasis?: boolean;
  indent?: boolean;
}

function DetailedItemBox({ x, y, width, title, lines }: {
  x: number;
  y: number;
  width: number;
  title: string;
  lines: readonly DetailLine[];
}) {
  return (
    <g className="iai-item iai-item-expanded">
      <rect x={x} y={y} width={width} height={layout.detailedArtifactHeight} />
      <text x={x + layout.inset} y={y + layout.artifactTitleOffset} className="iai-item-title">{title}</text>
      {lines.map((line, index) => (
        <text
          key={line.text}
          x={x + layout.inset + (line.indent ? 12 : 0)}
          y={y + layout.artifactDetailOffset + index * layout.artifactLineGap}
          className={line.emphasis ? 'iai-item-detail iai-item-detail-key' : 'iai-item-detail'}
        >
          {line.text}
        </text>
      ))}
    </g>
  );
}

function CanvasAcquisitionBox({ arrow }: { arrow: string }) {
  const center = column.canvasProcess + layout.width.resolve / 2;
  const innerX = column.canvasProcess + layout.inset;
  const innerWidth = layout.width.resolve - layout.inset * 2;

  return (
    <g className="iai-acquisition">
      <rect x={column.canvasProcess} y="86" width={layout.width.resolve} height="274" />
      <text x={center} y="118" textAnchor="middle" className="iai-title">
        Resolve <tspan className="iai-title-qualifier">(stateful)</tspan>
      </text>

      <g className="iai-stage-box">
        <rect x={innerX} y="138" width={innerWidth} height="48" />
        <text x={center} y="168" textAnchor="middle" className="iai-stage-title">Track gesture state</text>
      </g>
      <path d={`M${center} 186V211`} className="iai-stage-connector" markerEnd={`url(#${arrow})`} />

      <g className="iai-stage-box">
        <rect x={innerX} y="216" width={innerWidth} height="48" />
        <text x={center} y="246" textAnchor="middle" className="iai-stage-title">Hit test marks</text>
      </g>
      <path d={`M${center} 264V289`} className="iai-stage-connector" markerEnd={`url(#${arrow})`} />

      <g className="iai-stage-box iai-compiler-pass">
        <rect x={innerX} y="294" width={innerWidth} height="48" />
        <text x={center} y="324" textAnchor="middle" className="iai-stage-title">Reverse to semantics</text>
      </g>
    </g>
  );
}

export function InteractionArchitectureIllustration() {
  const id = useId().replace(/:/g, '');
  const arrow = `${id}-arrow`;

  return (
    <figure className="iai-figure">
      <div className="iai-stage">
        <svg
          viewBox={`0 0 ${layout.canvasWidth} 650`}
          role="img"
          aria-label="Canvas and external interactions converge on one chart update processor"
        >
          <defs>
            <marker id={arrow} viewBox="0 0 8 10" refX="7" refY="5" markerWidth="8" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M1 1L7 5L1 9" className="iai-arrow-head" />
            </marker>
          </defs>

          <g className="iai-boundary">
            <path d={`M${column.canvasProcess - layout.inset} 64H${column.update - 10}V252H${column.output - layout.gap / 2}V424H${column.handler - layout.inset}V378H${column.canvasProcess - layout.inset}Z`} />
            <text x={column.canvasProcess} y="52">flint-interactive</text>
          </g>

          <ItemBox x={column.input} y={centeredY(221, layout.height.compact)} width={layout.width.input} height={layout.height.compact} title="Canvas input" />
          <CanvasAcquisitionBox arrow={arrow} />
          <DetailedItemBox
            x={column.canvasEvent}
            y={158}
            width={layout.width.canvasEvent}
            title="Flint canvas event"
            lines={[
              { text: '- Gesture: action, phase' },
              { text: '- Geometry: plot, region, domain' },
              { text: '- Visual target: kind, role' },
              { text: '- Semantic data: key, value, records', emphasis: true },
            ]}
          />
          <Box x={column.handler} y={113} width={layout.width.dispatch} height={layout.height.standard} title="Emit event" />
          <path d={`M${column.input + layout.width.input} 221H${column.canvasProcess}`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <path d={`M${column.canvasProcess + layout.width.resolve} 221H${column.canvasEvent}`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <path d={`M${column.canvasEvent + layout.width.canvasEvent} 174L${column.handler} 149`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <path d={`M${column.handler + layout.width.dispatch} 149h26`} className="iai-flow iai-flow-dashed" markerEnd={`url(#${arrow})`} />
          <text x={column.handler + layout.width.dispatch + 40} y="154" className="iai-flow-label">handled by application</text>

          <Box
            x={column.handler}
            y={287}
            width={layout.width.group}
            height={layout.height.prominent}
            title="Evaluate interaction"
          />
          <ItemBox
            x={column.handler - 64}
            y={472}
            width={layout.width.group + 128}
            height={94}
            title="Interaction handlers"
            detail={[
              'Choose preset (e.g. click-emphasize, pan-zoom) or',
              'define custom handlers',
            ]}
          />
          <path d={`M${column.handler + layout.width.group / 2} 472V379`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <text x={column.handler + layout.width.group / 2 + 12} y="430" className="iai-extension-label">register</text>
          <path d={`M${column.canvasEvent + layout.width.canvasEvent} 268L${column.handler} 317`} className="iai-flow" markerEnd={`url(#${arrow})`} />

          <ItemBox x={column.input} y={390} width={layout.width.input} height={layout.height.compact} title="External input" />
          <Box x={column.externalProcess} y={390} width={layout.width.dispatch} height={layout.height.compact} title="Dispatch external events" />
          <ItemBox x={column.externalEvent} y={390} width={layout.width.externalEvent} height={layout.height.compact} title="Flint external event" />
          <path d={`M${column.input + layout.width.input} 422H${column.externalProcess}`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <path d={`M${column.externalProcess + layout.width.dispatch} 422H${column.externalEvent}`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <path d={`M${column.externalEvent + layout.width.externalEvent} 422L${column.handler} 349`} className="iai-flow" markerEnd={`url(#${arrow})`} />

          <DetailedItemBox
            x={column.update}
            y={270}
            width={layout.width.update}
            title="Chart update spec"
            lines={[
              { text: '- Update target' },
              { text: '- Ops (set-style,' },
              { text: 'set-annotation, set-viewport,', indent: true },
              { text: 'set-order)', indent: true },
            ]}
          />
          <path d={`M${column.handler + layout.width.group} 333H${column.update}`} className="iai-flow" markerEnd={`url(#${arrow})`} />

          <ItemBox x={column.apply + (layout.width.compactProcess - layout.width.baseState) / 2} y={167} width={layout.width.baseState} height={layout.height.compact} title="Base chart state" />
          <Box x={column.apply} y={287} width={layout.width.compactProcess} height={layout.height.prominent} title="Realize chart update" className="iai-compiler-pass" />
          <path d={`M${column.update + layout.width.update} 333H${column.apply}`} className="iai-flow" markerEnd={`url(#${arrow})`} />
          <path d={`M${column.apply + layout.width.compactProcess / 2} 231V287`} className="iai-flow" markerEnd={`url(#${arrow})`} />

          <ItemBox x={column.output} y={287} width={layout.width.output} height={layout.height.prominent} title="Chart with effects" />
          <path d={`M${column.apply + layout.width.compactProcess} 333H${column.output}`} className="iai-flow" markerEnd={`url(#${arrow})`} />
        </svg>
      </div>
      <figcaption>
        Flint&apos;s interaction architecture reuses chart-specific knowledge in both directions. Canvas input maps rendered marks back to semantic events; chart update specs are then resolved through chart-specific presentation and applied through precompiled renderer stores and signals. Preserving the renderer&apos;s reactive dataflow avoids recompilation during interaction while enabling handlers and application code to express intent without reimplementing chart semantics or backend logic.
      </figcaption>
    </figure>
  );
}