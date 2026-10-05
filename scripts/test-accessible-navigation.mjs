// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Run with: node --test scripts/test-accessible-navigation.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const executablePath = process.env.CHROME_PATH ?? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].find((path) => existsSync(path));

test('accessible navigation activation in a real DOM', async (t) => {
    assert.ok(executablePath, 'Install Chrome/Chromium or set CHROME_PATH to its executable.');
    const bundle = await build({
        absWorkingDir: root,
        stdin: {
            contents: `export * from './packages/flint-js/src/vegalite/interactions/accessible-navigation/controller.ts';
                export * from './packages/flint-js/src/vegalite/interactions/presentation/target-feedback-overlay.ts';
                export { buildInteractiveChart, accessibleNavigation } from './packages/flint-js/src/interactive/index.ts';
                export { expressionInterpreter } from 'vega-interpreter';`,
            resolveDir: root,
        },
        bundle: true,
        format: 'iife',
        globalName: 'accessibleController',
        write: false,
    });
    const browser = await puppeteer.launch({ executablePath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const setup = async (mode) => {
        await page.goto('about:blank');
        await page.setContent('<div id="chart"></div><button id="outside">Outside</button>');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate((mode) => {
            const state = window.probe = { errors: [], failure: new Error('activation test failure'), content: 'Sales: 200' };
            console.error = (...args) => state.errors.push({
                message: args[0],
                sameError: args[1] === state.failure,
            });
            const buildTree = () => {
                const chart = { id: 'chart', localId: 'chart', kind: 'chart', type: 'Chart', content: 'Sales', children: [], members: [] };
                chart.readingDirection = mode === 'vertical' ? 'vertical' : 'horizontal';
                chart.children = ['US', 'France'].map((country) => ({
                    id: `chart/${country}`, localId: country, kind: 'mark', type: 'Bar',
                    content: `Country: ${country}, ${state.content}`,
                    children: [], members: [], parent: chart,
                }));
                return chart;
            };
            state.controller = window.accessibleController.mountAccessibleNavigation({
                container: document.getElementById('chart'),
                settings: { caption: true, emphasis: true, sections: ['data'], maxFields: 8 },
                buildTree,
                coordinateSpace: () => ({
                    rect: new DOMRect(0, 0, 300, 200),
                    logicalWidth: 300, logicalHeight: 200,
                    originX: 0, originY: 0, plotWidth: 300, plotHeight: 200,
                }),
                containerLayoutSize: () => ({ width: 300, height: 200 }),
                present() {},
                clear() {},
                activate() {
                    if (mode === 'throw') throw state.failure;
                    if (mode === 'reject') return Promise.reject(state.failure);
                    if (mode === 'false') return false;
                    if (mode === 'async-false') return Promise.resolve(false);
                    return new Promise((resolve, reject) => {
                        state.resolve = resolve;
                        state.reject = reject;
                    });
                },
            });
            document.querySelector('[data-flint-accessible-focus]').focus();
        }, mode);
        await page.keyboard.press('Enter');
    };
    const state = () => page.evaluate(() => ({
        live: document.querySelector('[data-flint-accessible-live]')?.textContent ?? '',
        label: document.querySelector('[data-flint-accessible-focus]')?.getAttribute('aria-label') ?? '',
        caption: document.querySelector('[data-flint-accessible-caption]')?.textContent ?? '',
        errors: window.probe.errors,
        layers: document.querySelectorAll('[data-flint-accessible-navigation]').length,
    }));

    await t.test('both arrow pairs traverse the same siblings even without geometry', async () => {
        await setup('vertical');
        assert.match((await state()).caption, /Arrows: move/);
        await page.keyboard.press('ArrowDown');
        assert.match((await state()).label, /Country: France/);
        await page.keyboard.press('ArrowUp');
        assert.match((await state()).label, /Country: US/);
        await page.keyboard.press('ArrowRight');
        assert.match((await state()).label, /Country: France/);
        await page.keyboard.press('ArrowRight');
        assert.equal((await state()).live, 'End of the chart.');
        await page.keyboard.press('ArrowLeft');
        assert.match((await state()).label, /Country: US/);
        await page.keyboard.press('h');
        assert.match((await state()).live, /^Default reading order is top to bottom/);
        assert.match((await state()).live, /Both arrow pairs visit every sibling/);
    });

    await t.test('parent-realm runtime aligns SVG focus bounds inside a scaled iframe', async () => {
        await page.goto('about:blank');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const result = await page.evaluate(async () => {
            const frame = document.createElement('iframe');
            frame.style.cssText = 'width:640px;height:560px;border:0';
            frame.srcdoc = '<html><head><style>body{margin:0}svg{display:block}</style></head><body></body></html>';
            await new Promise((resolve) => {
                frame.onload = resolve;
                document.body.append(frame);
            });
            const owner = frame.contentDocument;
            const host = owner.createElement('div');
            host.style.cssText = 'position:relative;width:max-content;margin:32px;transform:scale(.75);transform-origin:top left';
            owner.body.append(host);
            const surface = window.accessibleController.buildInteractiveChart(host, {
                theme_spec: 'powerbi-light',
                data: { values: [{ Quantity: 1, Value: 4 }, { Quantity: 2, Value: 7 }] },
                semantic_types: { Quantity: 'Quantity', Value: 'Quantity' },
                chart_spec: {
                    chartType: 'Scatter Plot', title: 'Frame geometry',
                    encodings: { x: 'Quantity', y: 'Value' }, baseSize: { width: 400, height: 260 },
                },
            }, {
                backend: 'vegalite', renderer: 'svg',
                expressionInterpreter: window.accessibleController.expressionInterpreter,
                interactions: [window.accessibleController.accessibleNavigation()],
            });
            await surface.ready;
            const proxy = owner.querySelector('[data-flint-accessible-focus]');
            proxy.focus();
            proxy.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const title = [...owner.querySelectorAll('svg text')].find((element) => element.textContent === 'Frame geometry');
            const focus = owner.querySelector('[data-flint-accessible-focus]');
            const caption = owner.querySelector('[data-flint-accessible-caption]');
            const result = {
                title: title.getBoundingClientRect().toJSON(),
                focus: focus.getBoundingClientRect().toJSON(),
                kind: focus.dataset.flintAccessibleFocus,
                caption: caption.getBoundingClientRect().toJSON(),
                width: frame.clientWidth, height: frame.clientHeight,
            };
            surface.destroy();
            frame.remove();
            return result;
        });
        assert.equal(result.kind, 'title');
        assert.ok(result.focus.left <= result.title.left && result.focus.top <= result.title.top);
        assert.ok(result.focus.right >= result.title.right && result.focus.bottom >= result.title.bottom);
        assert.ok(result.title.left - result.focus.left < 6 && result.title.top - result.focus.top < 6);
        assert.ok(result.caption.width > 0 && result.caption.height > 0);
        assert.ok(result.caption.left >= 0 && result.caption.top >= 0);
        assert.ok(result.caption.right <= result.width && result.caption.bottom <= result.height);
    });

    await t.test('parent-realm renderer keeps hover tooltips in the chart iframe', async () => {
        await page.goto('about:blank');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const point = await page.evaluate(async () => {
            const frame = document.createElement('iframe');
            frame.style.cssText = 'width:640px;height:560px;border:0;margin:80px 100px';
            frame.srcdoc = '<html><head><style>body{margin:0}svg{display:block}</style></head><body></body></html>';
            await new Promise((resolve) => {
                frame.onload = resolve;
                document.body.append(frame);
            });
            const owner = frame.contentDocument;
            const host = owner.createElement('div');
            host.style.cssText = 'position:relative;width:max-content;margin:32px;transform:scale(.75);transform-origin:top left';
            owner.body.append(host);
            const surface = window.accessibleController.buildInteractiveChart(host, {
                data: { values: [{ Country: 'France', Value: 4 }, { Country: 'Japan', Value: 7 }] },
                semantic_types: { Country: 'Category', Value: 'Quantity' },
                chart_spec: {
                    chartType: 'Bar Chart', encodings: { x: 'Country', y: 'Value' },
                    baseSize: { width: 400, height: 260 },
                },
            }, {
                backend: 'vegalite', renderer: 'svg',
                expressionInterpreter: window.accessibleController.expressionInterpreter,
            });
            await surface.ready;
            const mark = [...owner.querySelectorAll('.mark-rect path')].find((node) => node.__data__?.tooltip);
            if (!mark) throw new Error('Missing tooltip-bearing bar mark.');
            const bounds = mark.getBoundingClientRect();
            const frameBounds = frame.getBoundingClientRect();
            window.tooltipProbe = { frame, surface, point: {
                x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
            } };
            return { x: frameBounds.left + window.tooltipProbe.point.x,
                y: frameBounds.top + window.tooltipProbe.point.y };
        });
        await page.mouse.move(point.x, point.y);
        try {
            await page.waitForFunction(() => {
                const tooltip = window.tooltipProbe.frame.contentDocument.querySelector('.vg-tooltip.visible');
                return tooltip?.style.visibility === 'visible';
            }, { timeout: 2000 });
        } catch (error) {
            t.diagnostic(JSON.stringify(await page.evaluate((point) => ({
                point, viewport: { width: innerWidth, height: innerHeight },
                hit: document.elementFromPoint(point.x, point.y)?.tagName,
                parent: document.querySelector('.vg-tooltip')?.outerHTML,
                child: window.tooltipProbe.frame.contentDocument.querySelector('.vg-tooltip')?.outerHTML,
                childHit: window.tooltipProbe.frame.contentDocument.elementFromPoint(
                    window.tooltipProbe.point.x, window.tooltipProbe.point.y,
                )?.outerHTML,
            }), point)));
            throw error;
        }
        const result = await page.evaluate(() => {
            const { frame, point, surface } = window.tooltipProbe;
            const tooltip = frame.contentDocument.querySelector('.vg-tooltip.visible');
            const bounds = tooltip.getBoundingClientRect();
            const result = {
                text: tooltip.textContent, x: bounds.left, y: bounds.top,
                right: bounds.right, bottom: bounds.bottom,
                width: frame.clientWidth, height: frame.clientHeight, point,
                parentTooltip: !!document.querySelector('.vg-tooltip.visible'),
            };
            surface.destroy();
            result.remainingTooltips = frame.contentDocument.querySelectorAll('.vg-tooltip').length;
            frame.remove();
            return result;
        });
        assert.match(result.text, /France/);
        assert.equal(result.parentTooltip, false);
        assert.ok(Math.abs(result.x - result.point.x) <= 20, JSON.stringify(result));
        assert.ok(Math.abs(result.y - result.point.y) <= 20, JSON.stringify(result));
        assert.ok(result.x >= 0 && result.y >= 0);
        assert.ok(result.right <= result.width && result.bottom <= result.height);
        assert.equal(result.remainingTooltips, 0);
    });

    for (const fallback of [false, true]) {
        await t.test(`caption escapes clipping and follows its anchor (${fallback ? 'body fallback' : 'top layer'})`, async () => {
            await setup('false');
            await page.evaluate((fallback) => {
                window.probe.controller.destroy();
                if (fallback) HTMLElement.prototype.showPopover = undefined;
                document.body.style.cssText = 'margin:0;min-height:1800px';
                const chart = document.getElementById('chart');
                chart.style.cssText = 'position:relative;overflow:hidden;width:300px;height:200px;margin:80px 30px;transform:scale(.8);transform-origin:top left';
                chart.innerHTML = '<svg width="300" height="200"></svg>';
                const root = { id: 'chart', localId: 'chart', kind: 'chart', type: 'Chart', content: 'Sales', children: [], members: [], bounds: { x1: 0, y1: 0, x2: 300, y2: 200 } };
                window.probe.controller = window.accessibleController.mountAccessibleNavigation({
                    container: chart,
                    settings: { caption: true, emphasis: true, sections: ['data'], maxFields: 8 },
                    buildTree: () => root,
                    coordinateSpace: () => ({ logicalWidth: 300, logicalHeight: 200, originX: 0, originY: 0 }),
                    containerLayoutSize: () => ({ width: 300, height: 200 }),
                    present() {}, clear() {}, activate() { return false; },
                });
                document.querySelector('[data-flint-accessible-focus]').focus({ preventScroll: true });
            }, fallback);
            await page.waitForFunction(() => {
                const caption = document.querySelector('[data-flint-accessible-caption]');
                const anchor = document.querySelector('[data-flint-accessible-focus]').getBoundingClientRect();
                return caption?.style.visibility === 'visible' && Math.abs(caption.getBoundingClientRect().top - anchor.bottom - 8) < 1;
            });
            const initial = await page.evaluate(() => {
                const caption = document.querySelector('[data-flint-accessible-caption]');
                const rect = caption.getBoundingClientRect();
                return { top: rect.top, hit: caption.contains(document.elementFromPoint(rect.left + 4, rect.top + 4)),
                    topLayer: caption.matches(':popover-open'), focused: document.activeElement.hasAttribute('data-flint-accessible-focus') };
            });
            assert.equal(initial.hit, true);
            assert.equal(initial.topLayer, !fallback);
            assert.equal(initial.focused, true);
            const scrollFollow = await page.evaluate(() => {
                const caption = document.querySelector('[data-flint-accessible-caption]');
                const anchor = document.querySelector('[data-flint-accessible-focus]');
                const before = { panel: caption.getBoundingClientRect().top, anchor: anchor.getBoundingClientRect().top };
                window.scrollTo(0, 40);
                return {
                    panelDelta: caption.getBoundingClientRect().top - before.panel,
                    anchorDelta: anchor.getBoundingClientRect().top - before.anchor,
                };
            });
            assert.ok(Math.abs(scrollFollow.panelDelta - scrollFollow.anchorDelta) < 1, JSON.stringify(scrollFollow));
            await page.waitForFunction((top) => Math.abs(document.querySelector('[data-flint-accessible-caption]').getBoundingClientRect().top - top + 40) < 1, {}, initial.top);
            await page.evaluate(() => window.scrollTo(0, 500));
            await page.waitForFunction(() => document.querySelector('[data-flint-accessible-caption]')?.style.visibility === 'hidden');
            assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-flint-accessible-focus')), true);
            await page.evaluate(() => window.scrollTo(0, 40));
            await page.waitForFunction(() => document.querySelector('[data-flint-accessible-caption]')?.style.visibility === 'visible');
            await page.setViewport({ width: 220, height: 180 });
            await page.waitForFunction(() => {
                const rect = document.querySelector('[data-flint-accessible-caption]').getBoundingClientRect();
                return rect.left >= 7 && rect.right <= innerWidth - 7 && rect.top >= 7 && rect.bottom <= innerHeight - 7;
            });
            await page.setViewport({ width: 800, height: 600 });
            await page.evaluate(() => { document.getElementById('chart').style.transform = 'translateX(100px) scale(.6)'; });
            await page.waitForFunction(() => {
                const panel = document.querySelector('[data-flint-accessible-caption]').getBoundingClientRect();
                const anchor = document.querySelector('[data-flint-accessible-focus]').getBoundingClientRect();
                return Math.abs(panel.left - anchor.left) < 1 && Math.abs(panel.top - anchor.bottom - 8) < 1;
            });
            await page.evaluate(() => {
                const clipper = document.createElement('div');
                clipper.id = 'clipper';
                clipper.style.cssText = 'height:160px;width:700px;overflow:auto';
                document.body.prepend(clipper);
                clipper.append(document.getElementById('chart'));
                const spacer = document.createElement('div');
                spacer.style.height = '500px';
                clipper.append(spacer);
                document.querySelector('[data-flint-accessible-focus]').focus({ preventScroll: true });
                window.scrollTo(0, 0);
            });
            await page.waitForFunction(() => document.querySelector('[data-flint-accessible-caption]')?.style.visibility === 'visible');
            await page.evaluate(() => { document.getElementById('clipper').scrollTop = 400; });
            await page.waitForFunction(() => document.querySelector('[data-flint-accessible-caption]')?.style.visibility === 'hidden');
            assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-flint-accessible-focus')), true);
            await page.evaluate(() => { document.getElementById('clipper').scrollTop = 0; });
            await page.waitForFunction(() => document.querySelector('[data-flint-accessible-caption]')?.style.visibility === 'visible');
            await page.focus('#outside');
            assert.equal(await page.$('[data-flint-accessible-caption]'), null);
            await page.focus('[data-flint-accessible-focus]');
            await page.evaluate(() => window.probe.controller.destroy());
            assert.equal(await page.$('[data-flint-accessible-caption]'), null);
        });
    }

    for (const embedded of [false, true]) {
        await t.test(`target details fit ${embedded ? 'the owning iframe' : 'a narrow viewport'} and scroll long content`, async () => {
            await page.setViewport({ width: 320, height: 240 });
            await setup('false');
            await page.evaluate((embedded) => {
                window.probe.controller.destroy();
                let owner = document;
                if (embedded) {
                    const frame = document.createElement('iframe');
                    frame.style.cssText = 'width:220px;height:160px;border:0';
                    document.body.replaceChildren(frame);
                    owner = frame.contentDocument;
                }
                owner.body.style.margin = '0';
                owner.body.innerHTML = '<div id="target-chart"><svg width="180" height="120"></svg></div>';
                const chart = owner.getElementById('target-chart');
                chart.style.cssText = 'position:absolute;right:0;bottom:0;width:180px;height:120px;overflow:hidden';
                const controller = window.accessibleController.createTargetFeedbackOverlay({
                    container: chart,
                    feedback: { indicator: false, details: { maxRows: 30 } },
                    coordinateSpace: () => ({ logicalWidth: 180, logicalHeight: 120, originX: 0, originY: 0 }),
                    containerLayoutSize: () => ({ width: 180, height: 120 }),
                });
                const item = { bounds: { x1: 170, y1: 110, x2: 178, y2: 118 }, tooltip: { Country: 'Norway' } };
                const render = () => controller.render(item, { elements: [{ value: {} }] }, 'keyboard');
                window.probe = { controller, owner, item, render };
                render();
            }, embedded);
            await page.waitForFunction(() => window.probe.owner.querySelector('[data-flint-target-details]')?.style.visibility === 'visible');
            const measure = () => page.evaluate(() => {
                const owner = window.probe.owner;
                const panel = owner.querySelector('[data-flint-target-details]');
                const anchor = owner.querySelector('[data-flint-target-indicator]').getBoundingClientRect();
                const rect = panel.getBoundingClientRect();
                return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                    anchorTop: anchor.top, width: owner.defaultView.innerWidth, height: owner.defaultView.innerHeight,
                    scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
                    topLayer: panel.matches(':popover-open'), inParent: document.querySelectorAll('[data-flint-target-details]').length };
            });
            const short = await measure();
            assert.ok(short.bottom <= short.anchorTop - 13, JSON.stringify(short));
            assert.ok(short.left >= 8 && short.right <= short.width - 8, JSON.stringify(short));
            assert.equal(short.topLayer, true);
            assert.equal(short.inParent, embedded ? 0 : 1);
            await page.evaluate(() => {
                window.probe.item.bounds = { x1: -40, y1: 110, x2: -32, y2: 118 };
                window.probe.render();
            });
            await page.waitForFunction(() => window.probe.owner.querySelector('[data-flint-target-details]')?.style.visibility === 'hidden');
            await page.evaluate(() => {
                window.probe.item.bounds = { x1: 170, y1: 110, x2: 178, y2: 118 };
                window.probe.render();
            });
            await page.waitForFunction(() => window.probe.owner.querySelector('[data-flint-target-details]')?.style.visibility === 'visible');
            await page.evaluate(() => {
                window.probe.item.tooltip = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [
                    `VeryLongUnbrokenFieldName${index}`, 'A long detail value '.repeat(12),
                ]));
                window.probe.render();
            });
            await page.waitForFunction(() => {
                const panel = window.probe.owner.querySelector('[data-flint-target-details]');
                const rect = panel.getBoundingClientRect();
                return panel.scrollHeight > panel.clientHeight && rect.top >= 7 && rect.bottom <= window.probe.owner.defaultView.innerHeight - 7;
            });
            const long = await measure();
            assert.ok(long.left >= 8 && long.right <= long.width - 8, JSON.stringify(long));
            await page.evaluate(() => {
                const panel = window.probe.owner.querySelector('[data-flint-target-details]');
                panel.scrollTop = 100;
            });
            assert.ok(await page.evaluate(() => window.probe.owner.querySelector('[data-flint-target-details]').scrollTop > 0));
            await page.evaluate(() => window.probe.controller.destroy());
            assert.equal(await page.evaluate(() => window.probe.owner.querySelector('[data-flint-target-details]')), null);
            await page.setViewport({ width: 800, height: 600 });
        });
    }

    for (const mode of ['throw', 'reject']) {
        await t.test(`${mode}: announces failure and reports the original error`, async () => {
            await setup(mode);
            await page.keyboard.press('Space');
            const result = await state();
            assert.equal(result.live, 'Could not activate this element.');
            assert.deepEqual(result.errors, [{
                message: 'Flint accessible-navigation activation failed:',
                sameError: true,
            }]);
            assert.match(result.label, /Country: US/);
        });
    }
    for (const mode of ['false', 'async-false']) {
        await t.test(`${mode}: repeats the reading without claiming activation`, async () => {
            await setup(mode);
            await page.keyboard.press('Space');
            const result = await state();
            assert.equal(result.live, result.label);
            assert.deepEqual(result.errors, []);
        });
    }
    await t.test('successful activation reads updated content after rendering', async () => {
        await setup('pending');
        await page.keyboard.press('Space');
        await page.evaluate(() => {
            window.probe.content = 'Sales: 400';
            window.probe.resolve(true);
        });
        const result = await state();
        assert.equal(result.live, 'Activated. Country: US, Sales: 400.');
        assert.match(result.label, /Sales: 400/);
        assert.match(result.caption, /Sales: 400/);
        assert.deepEqual(result.errors, []);
    });
    for (const action of ['move', 'blur', 'destroy', 'help', 'supersede']) {
        for (const outcome of ['resolve', 'reject']) {
            await t.test(`pending ${outcome} after ${action} does not overwrite the current announcement`, async () => {
                await setup('pending');
                await page.keyboard.press('Space');
                await page.evaluate(() => {
                    window.probe.pendingResolve = window.probe.resolve;
                    window.probe.pendingReject = window.probe.reject;
                });
                if (action === 'move') await page.keyboard.press('ArrowRight');
                if (action === 'help') await page.keyboard.press('h');
                if (action === 'supersede') await page.keyboard.press('Space');
                if (action === 'blur') {
                    await page.focus('#outside');
                    await page.focus('[data-flint-accessible-focus]');
                }
                if (action === 'destroy') await page.evaluate(() => window.probe.controller.destroy());
                const before = await state();
                await page.evaluate((outcome) => {
                    if (outcome === 'resolve') window.probe.pendingResolve(true);
                    else window.probe.pendingReject(window.probe.failure);
                }, outcome);
                const after = await state();
                assert.equal(after.live, before.live);
                assert.equal(after.label, before.label);
                assert.equal(after.layers, action === 'destroy' ? 0 : 1);
                assert.equal(after.errors.length, outcome === 'reject' ? 1 : 0);
            });
        }
    }
    assert.deepEqual(pageErrors, []);
});
