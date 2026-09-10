/**
 * The chart frame.
 *
 * Every chart in this dashboard is created through `chart()`, which supplies
 * the title block, the export menu, the "View as table" toggle, the accessible
 * summary and the resize handling. Doing it here rather than per page is what
 * makes the accessibility and export requirements true of every chart instead
 * of the ones someone remembered.
 *
 * A page supplies `render({ svg, width, height })` and the exact rows it
 * plotted. The rows are what the table and the CSV export show, so the download
 * is guaranteed to be the plotted data rather than a re-query that might drift.
 */

import { d3 } from './vendor.js';
import { strings, t } from './strings.js';
import { slug } from './format.js';
import { token, clearTokenCache } from './grammar.js';

/**
 * @param {object} spec
 *   root        element to mount into
 *   title       chart title (16px, 600)
 *   subtitle    one sentence saying what the number is and where it came from
 *   ariaLabel   a summary of the chart for assistive tech
 *   sourceNote  one-line provenance, printed on the PNG export
 *   columns     [{key, label, num}] for the table and CSV
 *   rows        the exact rows plotted, already formatted for display
 *   height      plot height in px, or a function of width
 *   render      ({svg, width, height, container}) => void
 */
export function chart(spec) {
  const {
    root, title, subtitle, ariaLabel, sourceNote = '',
    columns = [], rows = [], height = 340, render,
    // Some views are better as real HTML than as SVG -- the competency map is a
    // grid with row and column headers, and a table gives screen readers and
    // keyboards that structure for free. `renderHtml` draws one; `svgFor` is an
    // optional second pass that builds an SVG only when someone exports an image,
    // so the accessible view and the deck-ready picture can both be right.
    renderHtml = null, svgFor = null,
  } = spec;

  const figure = document.createElement('figure');
  figure.className = 'chart';

  // --- Header: title, subtitle, and the two controls every chart carries ---
  const header = document.createElement('figcaption');
  header.className = 'chart__header';

  const heading = document.createElement('div');
  heading.className = 'chart__headings';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'chart__title';
    h.textContent = title;
    heading.append(h);
  }
  if (subtitle) {
    const p = document.createElement('p');
    p.className = 'chart__subtitle';
    p.textContent = subtitle;
    heading.append(p);
  }
  header.append(heading);

  const tools = document.createElement('div');
  tools.className = 'chart__tools';

  const tableToggle = document.createElement('button');
  tableToggle.type = 'button';
  tableToggle.className = 'chart__tool';
  tableToggle.textContent = strings.chart.viewAsTable;
  tableToggle.setAttribute('aria-expanded', 'false');
  tools.append(tableToggle);

  const exportWrap = document.createElement('div');
  exportWrap.className = 'chart__export';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'chart__tool';
  exportButton.textContent = strings.chart.export;
  exportButton.setAttribute('aria-expanded', 'false');
  exportButton.setAttribute('aria-haspopup', 'menu');
  const exportMenu = document.createElement('div');
  exportMenu.className = 'chart__menu';
  exportMenu.setAttribute('role', 'menu');
  exportMenu.hidden = true;
  exportWrap.append(exportButton, exportMenu);
  tools.append(exportWrap);
  header.append(tools);
  figure.append(header);

  // --- Plot ----------------------------------------------------------------
  const container = document.createElement('div');
  container.className = 'chart__plot';
  container.setAttribute('role', 'img');
  if (ariaLabel) container.setAttribute('aria-label', ariaLabel);
  figure.append(container);

  // --- Table view, hidden until asked for ----------------------------------
  const tableWrap = document.createElement('div');
  tableWrap.className = 'chart__table';
  tableWrap.hidden = true;
  figure.append(tableWrap);

  root.append(figure);

  // --- Rendering, re-run on resize ----------------------------------------
  let currentWidth = 0;

  function draw() {
    const width = container.clientWidth;
    if (!width) return;
    currentWidth = width;
    clearTokenCache();

    if (renderHtml) {
      container.innerHTML = '';
      renderHtml({ container, width });
      return;
    }

    container.querySelectorAll('svg, .tooltip').forEach((node) => node.remove());

    const plotHeight = typeof height === 'function' ? height(width) : height;
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', plotHeight)
      .attr('viewBox', `0 0 ${width} ${plotHeight}`)
      .attr('class', 'chart__svg')
      .attr('aria-hidden', 'true');

    render({ svg, width, height: plotHeight, container });
  }

  const observer = new ResizeObserver((entries) => {
    const width = Math.round(entries[0].contentRect.width);
    // Re-render only on a real width change, not on every sub-pixel nudge.
    if (Math.abs(width - currentWidth) > 1) draw();
  });
  observer.observe(container);
  draw();

  // --- Table ---------------------------------------------------------------
  function buildTable() {
    tableWrap.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'data';
    const caption = document.createElement('caption');
    caption.textContent = `${title || ''} — ${strings.a11y.tableCaption}`;
    table.append(caption);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const column of columns) {
      const th = document.createElement('th');
      th.scope = 'col';
      if (column.num) th.className = 'num';
      th.textContent = column.label;
      headRow.append(th);
    }
    thead.append(headRow);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const column of columns) {
        const td = document.createElement('td');
        if (column.num) td.className = 'num';
        const value = row[column.key];
        td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    tableWrap.append(wrap);
  }

  tableToggle.addEventListener('click', () => {
    const open = tableWrap.hidden;
    if (open) buildTable();
    tableWrap.hidden = !open;
    container.hidden = open;
    tableToggle.textContent = open ? strings.chart.viewAsChart : strings.chart.viewAsTable;
    tableToggle.setAttribute('aria-expanded', String(open));
  });

  // --- Exports -------------------------------------------------------------
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filename = slug(title || 'chart');

  function exportCsv() {
    const escape = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      columns.map((c) => escape(c.label)).join(','),
      ...rows.map((row) => columns.map((c) => escape(row[c.key])).join(',')),
    ];
    download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
  }

  /**
   * Serialise the chart with its title, subtitle and source note baked in, so
   * an image pasted into a review deck still says what it is and where it came
   * from. Styles are inlined because the exported file leaves this document.
   */
  function serialiseSvg() {
    // An HTML view builds its export SVG on demand rather than keeping one in
    // the page purely so it can be downloaded.
    const source = renderHtml ? (svgFor ? svgFor() : null) : container.querySelector('svg');
    if (!source) return null;
    const clone = source.cloneNode(true);
    const width = Number(source.getAttribute('width'));
    const plotHeight = Number(source.getAttribute('height'));
    const headHeight = title ? (subtitle ? 46 : 26) : 0;
    const footHeight = sourceNote ? 20 : 0;
    const total = plotHeight + headHeight + footHeight + 12;

    const out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    out.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    out.setAttribute('width', width);
    out.setAttribute('height', total);
    out.setAttribute('viewBox', `0 0 ${width} ${total}`);

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent =
      `text{font-family:${token('--font-sans') || 'system-ui, sans-serif'};` +
      `font-variant-numeric:tabular-nums}`;
    out.append(style);

    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', width);
    background.setAttribute('height', total);
    background.setAttribute('fill', token('--paper') || '#fff');
    out.append(background);

    const text = (content, y, size, weight, fill) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      node.setAttribute('x', 0);
      node.setAttribute('y', y);
      node.setAttribute('font-size', size);
      node.setAttribute('font-weight', weight);
      node.setAttribute('fill', fill);
      node.textContent = content;
      return node;
    };

    if (title) out.append(text(title, 16, 16, 600, token('--ink')));
    if (subtitle) out.append(text(subtitle, 36, 12.8, 400, token('--slate')));

    const plot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    plot.setAttribute('transform', `translate(0,${headHeight})`);
    while (clone.firstChild) plot.append(clone.firstChild);
    out.append(plot);

    if (sourceNote) out.append(text(sourceNote, total - 6, 11, 400, token('--slate')));

    return { markup: new XMLSerializer().serializeToString(out), width, height: total };
  }

  function exportSvg() {
    const result = serialiseSvg();
    if (!result) return;
    download(new Blob([result.markup], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
  }

  function exportPng() {
    const result = serialiseSvg();
    if (!result) return;
    const scale = 2; // readable when dropped into a deck at full width
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = result.width * scale;
      canvas.height = result.height * scale;
      const context = canvas.getContext('2d');
      context.fillStyle = token('--paper') || '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && download(blob, `${filename}.png`), 'image/png');
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.markup)}`;
  }

  const menuItems = [[strings.chart.downloadCsv, exportCsv]];
  if (!renderHtml || svgFor) {
    menuItems.unshift([strings.chart.downloadPng, exportPng], [strings.chart.downloadSvg, exportSvg]);
  }
  for (const [label, action] of menuItems) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    item.addEventListener('click', () => {
      action();
      exportMenu.hidden = true;
      exportButton.setAttribute('aria-expanded', 'false');
    });
    exportMenu.append(item);
  }

  exportButton.addEventListener('click', () => {
    const open = exportMenu.hidden;
    exportMenu.hidden = !open;
    exportButton.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (!exportWrap.contains(event.target)) {
      exportMenu.hidden = true;
      exportButton.setAttribute('aria-expanded', 'false');
    }
  });

  exportWrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      exportMenu.hidden = true;
      exportButton.setAttribute('aria-expanded', 'false');
      exportButton.focus();
    }
  });

  return {
    figure,
    container,
    redraw: draw,
    destroy() {
      observer.disconnect();
      figure.remove();
    },
  };
}

/** The standard source note printed on every export. */
export function sourceNoteFor(file) {
  return t(strings.chart.sourceNote, { file });
}
