'use strict';

const samples = window.studentPlatformSamples;
const views = ['source', 'thought', 'language', 'summary'];
const byId = id => document.getElementById(id);
const tabs = Array.from(document.querySelectorAll('[data-view]'));
const sourcePanel = byId('panel-source');
const thoughtPanel = byId('panel-thought');
const figurePanel = byId('task-figures');
const chars = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => chars[char]);
const noteFor = id => sample.issues.find(note => note.id === id);
let sample;
let selected;
let frame;
let mapFrame;
const resize = new ResizeObserver(scheduleNotes);
const mapResize = new ResizeObserver(scheduleMap);

function showView(view) {
  for (const tab of tabs) {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    byId(`panel-${tab.dataset.view}`).hidden = !active;
  }
  if (view === 'source') scheduleNotes();
  if (view === 'thought') drawMapWires();
}

function reveal(node) {
  if (!node) return;
  node.scrollIntoView({block: 'nearest'});
  if (node.matches('button')) node.focus({preventScroll: true});
}

function drawFigures() {
  const figures = sample.figures || [];
  byId('material-title').textContent = figures.length ? '题目与图表' : '写作题目';
  byId('task-prompt').textContent = sample.prompt;
  figurePanel.innerHTML = figures.map((figure, index) => {
    const head = figure.years.map(year => `<th scope="col">${year}</th>`).join('');
    const rows = figure.series.map(series => `<tr><th scope="row">${escapeHtml(series.name)}</th>${series.values.map(value => `<td>${value}</td>`).join('')}</tr>`).join('');
    return `<figure id="figure-${index + 1}"><figcaption>${escapeHtml(figure.title)}</figcaption><img class="question-chart" src="${escapeHtml(figure.src)}" alt="${escapeHtml(figure.title)}"><details class="figure-values"><summary>查看数据表</summary><table><thead><tr><th scope="col">${escapeHtml(figure.unit)}</th>${head}</tr></thead><tbody>${rows}</tbody></table></details></figure>`;
  }).join('');
}

function pin(issue, paragraph = false) {
  const extra = paragraph ? ' paragraph-pin' : '';
  const anchor = paragraph ? ` data-anchor="${issue.id}"` : '';
  return `<button type="button" class="pin${extra}" data-note="${issue.id}"${anchor} aria-pressed="false" aria-controls="note-${issue.id}" aria-label="${paragraph ? '段评' : '批注'}${issue.id}">${issue.id}</button>`;
}

function drawParagraph(text, index) {
  const notes = sample.issues.filter(issue => issue.paragraph === index + 1);
  const pins = notes.filter(issue => issue.scope === 'paragraph').map(issue => pin(issue, true)).join('');
  const phrases = notes.filter(issue => issue.scope === 'phrase').sort((a, b) => a.start - b.start);
  let cursor = 0;
  let marked = pins;
  for (const issue of phrases) {
    const end = issue.start + issue.quote.length;
    marked += escapeHtml(text.slice(cursor, issue.start));
    marked += `<span class="phrase" data-anchor="${issue.id}">${escapeHtml(text.slice(issue.start, end))}</span>${pin(issue)}`;
    cursor = end;
  }
  return `<p class="paragraph" id="paragraph-${index + 1}" lang="en">${marked}${escapeHtml(text.slice(cursor))}</p>`;
}

function drawAssessment() {
  const criterionNames = {
    TA: '任务完成情况',
    TR: '任务回应',
    CC: '连贯与衔接',
    LR: '词汇资源',
    GRA: '语法多样性与准确性'
  };
  const wordStatus = sample.minimumMet ? '达到' : '未达到';
  const rows = sample.assessment.criteria.map(item => `
    <tr>
      <th scope="row">
        <span class="criterion-name">${criterionNames[item.code]}</span>
        <span class="criterion-code" lang="en">${item.code}</span>
      </th>
      <td class="criterion-score"><span>${item.score}</span></td>
      <td class="criterion-feedback">${escapeHtml(item.text)}</td>
    </tr>`).join('');
  return `
    <section class="assessment" aria-labelledby="assessment-heading">
      <header class="assessment-title">
        <div>
          <h3 id="assessment-heading">四项评价</h3>
          <p>原文 ${sample.wordCount} 词，${wordStatus} ${sample.minimum} 词要求。</p>
        </div>
        <div class="assessment-total">
          <span>单篇估分</span>
          <strong>${sample.assessment.band}</strong>
        </div>
      </header>
      <div class="assessment-frame">
        <table class="assessment-table">
          <caption class="sr-only">分项评分与评语</caption>
          <colgroup><col class="criterion-col"><col class="score-col"><col></colgroup>
          <thead>
            <tr><th scope="col">评分项</th><th scope="col" class="criterion-score">分数</th><th scope="col">评语</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function drawSource() {
  const notes = sample.issues.map(issue => {
    const caption = issue.track === 'thought' ? '看思维复盘' : '看表达讲评';
    return `<article class="margin-note" data-note-card="${issue.id}" id="note-${issue.id}"><button class="note-body" type="button" data-note="${issue.id}" aria-pressed="false" aria-controls="paragraph-${issue.paragraph}"><span class="number">${issue.id}</span><span><strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.text)}</span></span></button><button class="text-button note-more" type="button" data-lesson="${issue.id}">${caption}</button></article>`;
  }).join('');
  sourcePanel.innerHTML = `<div class="reading"><article class="paper"><header class="paper-top"><h3>学生原文</h3><span>${sample.wordCount} 词</span></header>${sample.paragraphs.map(drawParagraph).join('')}</article><aside aria-label="页边批注"><header class="margin-top"><h3>页边批注</h3><span>${sample.issues.length} 处</span></header><div class="notes">${notes}</div></aside></div>${drawAssessment()}`;
  resize.disconnect();
  resize.observe(sourcePanel.querySelector('.paper'));
}

function alignNotes() {
  const reading = sourcePanel.querySelector('.reading');
  if (!reading || sourcePanel.hidden) return;
  const column = reading.querySelector('.notes');
  const wide = matchMedia('(min-width: 801px)').matches;
  reading.classList.toggle('aligned', wide);
  if (!wide) {
    column.style.minHeight = '';
    return;
  }
  const origin = column.getBoundingClientRect().top;
  let bottom = 0;
  for (const issue of sample.issues) {
    const card = byId(`note-${issue.id}`);
    const anchor = reading.querySelector(`[data-anchor="${issue.id}"]`);
    const top = Math.max(bottom, anchor.getClientRects()[0].top - origin - 4);
    card.style.setProperty('--note-top', `${Math.round(top)}px`);
    bottom = top + card.offsetHeight + 7;
  }
  column.style.minHeight = `${Math.ceil(bottom - 7)}px`;
}

function scheduleNotes() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(alignNotes);
}

function selectIssue(id) {
  selected = id;
  for (const control of sourcePanel.querySelectorAll('[data-note]')) control.setAttribute('aria-pressed', String(control.dataset.note === id));
  for (const card of sourcePanel.querySelectorAll('[data-note-card]')) card.classList.toggle('is-selected', card.dataset.noteCard === id);
  for (const anchor of sourcePanel.querySelectorAll('.phrase')) anchor.classList.toggle('is-selected', anchor.dataset.anchor === id);
  byId('review-status').textContent = `已选中批注${id}，${noteFor(id).label}`;
  scheduleNotes();
}

function drawThought() {
  const map = sample.mindmap;
  const outline = sample.outline ? `<details class="outline mindmap-outline"><summary>样稿的原始中文提纲</summary><ul>${sample.outline.map(row => `<li><strong>${escapeHtml(row.title)}</strong>　${escapeHtml(row.text)}</li>`).join('')}</ul></details>` : '';
  const branches = map.branches.map(branch => {
    const nodes = branch.nodes.map((node, i) => {
      const follows = branch.sequence && i > 0;
      const parent = follows ? `node-${branch.nodes[i - 1].id}` : `branch-${branch.id}`;
      const flag = node.issue ? `<span class="map-number">${node.issue}</span>` : '';
      return `<li><button class="map-node${node.issue ? ' map-gap' : ''}" type="button" id="mind-node-${node.id}" data-mind-node="${node.id}" data-key="node-${node.id}" data-parent="${parent}"${follows ? ' data-vertical' : ''} aria-controls="mind-inspector" aria-pressed="false"><span class="map-node-label">${flag}${escapeHtml(node.label)}</span><strong>${escapeHtml(node.title)}</strong></button></li>`;
    }).join('');
    return `<section class="map-branch"><div class="map-topic" data-key="branch-${branch.id}" data-parent="root"><span>${escapeHtml(branch.label)}</span><strong>${escapeHtml(branch.title)}</strong></div><ul class="map-leaves${branch.sequence ? ' map-sequence' : ''}">${nodes}</ul></section>`;
  }).join('');
  const issues = map.branches.flatMap(branch => branch.nodes).filter(node => node.issue).length;
  thoughtPanel.innerHTML = `<header class="mindmap-heading"><div><h3>思维导图</h3><p>点带编号的节点，查看这一步哪里有问题、怎么想、怎么做。</p></div><span class="map-total">${issues} 处待复盘</span></header><div class="mindmap-layout"><div id="mind-board" class="mind-board" aria-label="${escapeHtml(map.title)}"><svg class="map-wires" aria-hidden="true"></svg><div class="map-root" data-key="root"><span>${escapeHtml(sample.label)}</span><strong>${escapeHtml(map.title)}</strong><p>${escapeHtml(map.note)}</p></div><div class="map-branches">${branches}</div></div><aside id="mind-inspector" class="mind-inspector" aria-label="选中节点的讲评" aria-live="polite"></aside></div>${outline}`;
  mapResize.disconnect();
  mapResize.observe(byId('mind-board'));
  selectMindNode(map.initial);
}

function scheduleMap() {
  cancelAnimationFrame(mapFrame);
  mapFrame = requestAnimationFrame(drawMapWires);
}

function drawMapWires() {
  const board = byId('mind-board');
  if (!board || thoughtPanel.hidden || matchMedia('(max-width: 650px)').matches) return;
  const bounds = board.getBoundingClientRect();
  const wireLayer = board.querySelector('svg');
  const elements = new Map(Array.from(board.querySelectorAll('[data-key]'), element => [element.dataset.key, element]));
  const active = new Set();
  let current = board.querySelector('[aria-pressed="true"]');
  while (current) {
    active.add(current.dataset.key);
    current = elements.get(current.dataset.parent);
  }
  wireLayer.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  const paths = [];
  for (const target of board.querySelectorAll('[data-parent]')) {
    const a = elements.get(target.dataset.parent).getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const vertical = target.hasAttribute('data-vertical');
    const x1 = (vertical ? a.left + a.width / 2 : a.right) - bounds.left;
    const x2 = (vertical ? b.left + b.width / 2 : b.left) - bounds.left;
    const y1 = (vertical ? a.bottom : a.top + a.height / 2) - bounds.top;
    const y2 = (vertical ? b.top : b.top + b.height / 2) - bounds.top;
    const mid = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', vertical ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`);
    if (target.classList.contains('map-gap')) path.classList.add('wire-gap');
    if (active.has(target.dataset.key)) path.classList.add('wire-active');
    paths.push(path);
  }
  wireLayer.replaceChildren(...paths);
}

function selectMindNode(id) {
  const map = sample.mindmap;
  const branch = map.branches.find(group => group.nodes.some(node => node.id === id));
  const node = branch.nodes.find(item => item.id === id);
  const issue = node.issue && noteFor(node.issue);
  for (const button of thoughtPanel.querySelectorAll('[data-mind-node]')) button.setAttribute('aria-pressed', String(button.dataset.mindNode === id));
  const badge = issue ? `<span class="map-number">${issue.id}</span>` : '';
  const quote = node.quote || (issue && issue.quote);
  const evidence = quote ? `<blockquote class="map-evidence"><span>成稿原句</span><p lang="en">${escapeHtml(quote)}</p></blockquote>` : '';
  const outline = node.outline !== undefined ? `<blockquote class="map-evidence"><span>中文提纲</span><p>${escapeHtml(sample.outline[node.outline].text)}</p></blockquote>` : '';
  const coaching = issue ? `<dl class="map-coaching"><div><dt>哪里没做好</dt><dd>${escapeHtml(node.detail)}</dd></div><div><dt>怎么想</dt><dd>${escapeHtml(node.think)}</dd></div><div><dt>怎么做</dt><dd>${escapeHtml(node.action)}</dd></div></dl>` : `<p class="map-proof">${escapeHtml(node.detail)}</p>`;
  const source = issue ? `<button class="text-button" type="button" data-return="${issue.id}">回到原文批注 ${issue.id}</button>` : node.paragraph ? `<button class="text-button" type="button" data-paragraph="${node.paragraph}">看原文第 ${node.paragraph} 段</button>` : '';
  const figure = node.figure ? `<button class="text-button" type="button" data-figure="${node.figure}">查看图 ${node.figure}</button>` : '';
  const panel = byId('mind-inspector');
  panel.classList.toggle('inspect-gap', Boolean(issue));
  panel.dataset.currentNode = id;
  panel.innerHTML = `<p class="map-breadcrumb">${escapeHtml(branch.label)} ${escapeHtml(branch.title)}</p><p class="map-inspector-label">${badge}${escapeHtml(node.label)}</p><h3>${escapeHtml(node.title)}</h3>${evidence}${outline}${coaching}<div class="map-links">${source}${figure}<button class="text-button map-back" type="button" data-map-back>回到导图</button></div>`;
  drawMapWires();
}

function drawLessons() {
  const language = sample.issues.filter(issue => issue.track === 'language');
  byId('panel-language').innerHTML = `<p class="section-intro">每条讲评都对应一处原文批注。先看这句想表达什么，再记一个可以迁移的搭配。</p>${language.map(issue => `<section class="lesson" id="lesson-${issue.id}"><h3><span class="number">${issue.id}</span>　${escapeHtml(issue.label)}</h3><p class="quote" lang="en">${escapeHtml(issue.quote)}</p><p>${escapeHtml(issue.text)}</p><p class="example" lang="en">${escapeHtml(issue.example)}</p><p>${escapeHtml(issue.use)}</p><button class="text-button" type="button" data-return="${issue.id}">回到原文批注 ${issue.id}</button></section>`).join('')}`;
}

function drawSummary() {
  const items = (rows, type) => rows.map(row => `<li><strong>${escapeHtml(row.title || row.phrase)}</strong><p>${escapeHtml(row.text)}</p><button class="text-button" type="button" data-lesson="${row.issue}">${type}</button></li>`).join('');
  byId('panel-summary').innerHTML = `<div class="summary-grid"><section class="summary-box"><h3>下一稿练什么思维动作</h3><ul>${items(sample.thoughtSummary, '回看推导')}</ul></section><section class="summary-box"><h3>本次积累的表达</h3><ul>${items(sample.languageSummary, '回看讲评')}</ul></section></div>`;
}

function openLesson(id) {
  const issue = noteFor(id);
  showView(issue.track);
  if (issue.track === 'language') {
    reveal(byId(`lesson-${id}`));
  } else {
    selectMindNode(id);
    reveal(matchMedia('(max-width: 980px)').matches ? byId('mind-inspector') : byId(`mind-node-${id}`));
  }
}

function openSample() {
  const [id, requestedView] = location.hash.slice(1).split('/');
  sample = samples.find(item => item.id === id) || samples[0];
  for (const button of document.querySelectorAll('[data-sample]')) button.setAttribute('aria-pressed', String(button.dataset.sample === sample.id));
  byId('task-label').textContent = `${sample.label} ${sample.type}`;
  byId('task-title').textContent = sample.title;
  drawFigures();
  drawSource();
  drawThought();
  drawLessons();
  drawSummary();
  showView(views.includes(requestedView) ? requestedView : 'source');
  selectIssue(sample.initial);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if (data.sample) {
    if (sample.id !== data.sample) location.hash = data.sample;
  } else if (data.view) showView(data.view);
  else if (data.mindNode) {
    selectMindNode(data.mindNode);
    if (matchMedia('(max-width: 980px)').matches) reveal(byId('mind-inspector'));
  } else if ('mapBack' in data) {
    reveal(byId(`mind-node-${byId('mind-inspector').dataset.currentNode}`));
  }
  else if (data.note) {
    selectIssue(data.note);
    const target = button.classList.contains('pin') ? byId(`note-${selected}`) : sourcePanel.querySelector(`[data-anchor="${selected}"]`);
    requestAnimationFrame(() => reveal(target));
  } else if (data.lesson) openLesson(data.lesson);
  else if (data.return) {
    showView('source');
    selectIssue(data.return);
    reveal(sourcePanel.querySelector(`.pin[data-note="${data.return}"]`));
  } else if (data.paragraph) {
    showView('source');
    reveal(byId(`paragraph-${data.paragraph}`));
  } else if (data.figure) {
    byId('task-material').open = true;
    reveal(byId(`figure-${data.figure}`));
  }
});

document.querySelector('.view-tabs').addEventListener('keydown', event => {
  const index = tabs.indexOf(event.target);
  const next = {ArrowLeft: (index + 3) % 4, ArrowRight: (index + 1) % 4, Home: 0, End: 3}[event.key];
  if (index < 0 || next === undefined) return;
  event.preventDefault();
  showView(views[next]);
  tabs[next].focus();
});
window.addEventListener('hashchange', openSample);
window.addEventListener('resize', scheduleNotes);
openSample();
