const STORAGE_PREFIX = 'flint-chart-editor:';

function readHashParams(): URLSearchParams {
  const hash = window.location.hash;
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

/** Persist a ChartAssemblyInput in sessionStorage and return a short token for the URL. */
export function saveEditorPayload(input: unknown): string | null {
  try {
    const id = crypto.randomUUID();
    sessionStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(input));
    return id;
  } catch (err) {
    console.warn('failed to save editor payload', err);
    return null;
  }
}

/** Load a previously saved payload; returns null if missing or invalid. */
export function loadEditorPayload(id: string): unknown | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

import { LOCALE_URL_SEGMENT, type Locale } from '../i18n/locales';

/**
 * Gallery deep link — small URL, no sessionStorage write during render.
 * Editor resolves via TEST_GENERATORS[generator][index].
 */
export function buildGalleryEditorHref(
  generator: string,
  index: number,
  locale: Locale = 'en',
): string {
  const segment = LOCALE_URL_SEGMENT[locale];
  const base = segment ? `/${segment}/editor` : '/editor';
  return `#${base}?g=${encodeURIComponent(generator)}&i=${index}`;
}

/** Read `case` query param (sessionStorage token) from the current hash URL. */
export function readEditorCaseParam(): string | null {
  return readHashParams().get('case');
}

/** Read gallery `g` + `i` params from the current hash URL. */
export function readGalleryCaseParams(): { generator: string; index: number } | null {
  const params = readHashParams();
  const generator = params.get('g');
  const indexRaw = params.get('i');
  if (!generator || indexRaw === null) return null;
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return null;
  return { generator, index };
}

/** Save payload on user action (not during render) and navigate to editor. */
export function openEditorWithPayload(input: unknown, locale: Locale = 'en'): string {
  const id = saveEditorPayload(input);
  const segment = LOCALE_URL_SEGMENT[locale];
  const base = segment ? `/${segment}/editor` : '/editor';
  if (id) return `#${base}?case=${encodeURIComponent(id)}`;
  return `#${base}`;
}
