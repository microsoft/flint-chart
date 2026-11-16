// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Flint MCP App: the card a `show` call opens.
 *
 * The call's result hands the card one version of a chart or a board, which the
 * card keeps: a chart draws as the chart card, a board as the board card.
 */
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useEffect, useRef, useState } from 'react';

import { BoardView, type Board } from './BoardView';
import { ChartView } from './ChartView';

declare const __FLINT_MCP_VERSION__: string;

/** How long the card waits for its result before it says it cannot be redrawn here. */
const RESULT_WAIT_MS = 6000;
const NOT_REDRAWN = 'The chart cannot be redrawn here. Ask the agent to show it again.';

/** The board a show result hands the card: in _meta, or in structuredContent where a host kept only that. */
function boardOf(result: { _meta?: unknown; structuredContent?: unknown }): Board | undefined {
  const meta = result._meta as { flint?: { board?: Board } } | undefined;
  const structured = result.structuredContent as { flint?: { board?: Board } } | undefined;
  return meta?.flint?.board ?? structured?.flint?.board;
}

const HELD_TEXT = 'The assistant is revising this spec; the fixed chart follows in a new card.';

export function FlintApp() {
  const [shown, setShown] = useState<Board | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const shownSeen = useRef(false);
  shownSeen.current = shown !== null;
  // The spec show was called with: a card the host draws again without its result draws it again from this.
  const toolInput = useRef<Record<string, unknown> | null>(null);

  const { app, error } = useApp({
    appInfo: { name: 'Flint', version: __FLINT_MCP_VERSION__ },
    capabilities: {},
    autoResize: true,
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.onerror = (err) => console.error(err);
      app.onhostcontextchanged = (params) => setHostContext((prev) => ({ ...prev, ...params }));
      app.ontoolinput = (params) => {
        toolInput.current = (params.arguments as Record<string, unknown> | undefined) ?? null;
      };
      app.ontoolresult = (result) => {
        const { content } = result as { content?: { type: string; text?: string }[] };
        if (result.isError) {
          // A spec held back for fixes is the agent's to revise: the card says so rather than list them.
          const held = (result._meta as { flint?: { held?: string } } | undefined)?.flint?.held;
          setFailed(held ? HELD_TEXT : content?.find((part) => part.type === 'text')?.text ?? '');
          return;
        }
        const next = boardOf(result);
        if (next) {
          setFailed(null);
          setShown(next);
        }
      };
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  // A reopened conversation may not hand the card its result again. The server keeps nothing, so the card
  // calls show again with the spec it was called with; without one, or a host that runs no tools, it says so.
  useEffect(() => {
    if (!app) return;
    const handle = window.setTimeout(() => {
      if (shownSeen.current) return;
      const args = toolInput.current;
      if (!args || !app.getHostCapabilities()?.serverTools) {
        setFailed((reason) => reason ?? NOT_REDRAWN);
        return;
      }
      app.callServerTool({ name: 'show', arguments: args }).then(
        (result) => {
          const next = !result.isError ? boardOf(result) : undefined;
          if (next) setShown(next);
          else setFailed((reason) => reason ?? NOT_REDRAWN);
        },
        () => setFailed((reason) => reason ?? NOT_REDRAWN),
      );
    }, RESULT_WAIT_MS);
    return () => window.clearTimeout(handle);
  }, [app]);

  if (error) {
    return (
      <div className="status">
        <strong>App error:</strong> {error.message}
      </div>
    );
  }
  if (!app) return <div className="status">Connecting…</div>;
  if (failed !== null) {
    return (
      <div className="status">
        <strong>Not drawn</strong>
        {failed && <div className="status-reason">{failed}</div>}
      </div>
    );
  }
  if (!shown) return <div className="status">Waiting for the chart…</div>;
  return shown.kind === 'chart'
    ? <ChartView app={app} shown={shown} hostContext={hostContext} />
    : <BoardView app={app} initial={shown} hostContext={hostContext} />;
}
