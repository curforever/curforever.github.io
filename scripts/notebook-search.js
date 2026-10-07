'use strict';
(() => {
  const panel = document.querySelector('#notebook-search');
  if (!panel) return;
  const form = panel.querySelector('form');
  const input = panel.querySelector('input');
  const status = panel.querySelector('[role="status"]');
  const results = panel.querySelector('ol');
  const reset = panel.querySelector('[type="reset"]');
  let indexPromise, timer, revision = 0;
  const normalize = text => text.normalize('NFKC').toLowerCase();

  async function loadIndex() {
    if (!indexPromise) {
      indexPromise = (async () => {
        const response = await fetch('/search.xml');
        if (!response.ok) throw new Error('Search index unavailable');
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('Invalid search index');
        const posts = [];
        for (const entry of xml.querySelectorAll('entry')) {
          const title = entry.querySelector('title')?.textContent.trim();
          const rawUrl = entry.querySelector('url')?.textContent.trim();
          if (!title || !rawUrl) continue;
          const url = new URL(rawUrl, location.origin);
          if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) continue;
          const body = document.createElement('template');
          body.innerHTML = entry.querySelector('content')?.textContent || '';
          body.content.querySelectorAll('script,style').forEach(node => node.remove());
          const text = body.content.textContent.replace(/\s+/g, ' ').trim();
          const labels = [...entry.querySelectorAll('category,tag')].map(node => node.textContent.trim());
          posts.push({ title, url: url.pathname + url.search + url.hash, text, labels,
            titleSearch: normalize(title), labelSearch: normalize(labels.join(' ')), textSearch: normalize(text) });
        }
        return posts;
      })().catch(error => { indexPromise = undefined; throw error; });
    }
    return indexPromise;
  }

  function excerpt(post, terms) {
    const match = post.textSearch.indexOf(terms[0]);
    const start = Math.max(0, match - 35);
    return (start ? '…' : '') + post.text.slice(start, start + 125) + (post.text.length > start + 125 ? '…' : '');
  }

  async function search() {
    clearTimeout(timer);
    const current = ++revision;
    const terms = [...new Set(normalize(input.value.trim()).split(/\s+/).filter(Boolean))];
    results.replaceChildren();
    reset.hidden = !terms.length;
    if (!terms.length) { status.textContent = '输入关键词查找标题、正文或标签，例如 Harmony、缓存、小米。'; return; }
    status.textContent = '正在查找…';
    try {
      const posts = await loadIndex();
      if (current !== revision) return;
      const matches = posts.map(post => {
        const searchable = post.titleSearch + ' ' + post.labelSearch + ' ' + post.textSearch;
        if (!terms.every(term => searchable.includes(term))) return null;
        const score = terms.reduce((sum, term) => sum + (post.titleSearch.includes(term) ? 10 : post.labelSearch.includes(term) ? 4 : 1), 0);
        return { post, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score || a.post.title.localeCompare(b.post.title, 'zh-CN'));
      status.textContent = matches.length ? `找到 ${matches.length} 篇${matches.length > 20 ? '，先显示最相关的 20 篇' : ''}。` : '没有找到；试试更短的词，或用空格组合关键词。';
      for (const { post } of matches.slice(0, 20)) {
        const item = document.createElement('li');
        const link = document.createElement('a'); link.href = post.url; link.textContent = post.title;
        const labels = document.createElement('small'); labels.textContent = post.labels.join(' · ');
        const snippet = document.createElement('p'); snippet.textContent = excerpt(post, terms);
        item.append(link, labels, snippet); results.append(item);
      }
    } catch (error) {
      if (current === revision) status.textContent = '搜索暂时不可用。可以再次点击查找，或先浏览完整归档。';
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  input.addEventListener('input', () => { ++revision; clearTimeout(timer); timer = setTimeout(search, 250); });
  form.addEventListener('reset', () => {
    clearTimeout(timer); ++revision; input.value = ''; results.replaceChildren(); reset.hidden = true;
    status.textContent = '输入关键词查找标题、正文或标签，例如 Harmony、缓存、小米。'; input.focus();
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { panel.open = false; panel.querySelector('summary').focus(); }
  });
  panel.addEventListener('toggle', () => { if (panel.open) input.focus(); });
  const query = new URLSearchParams(location.search).get('q');
  if (query || location.hash === '#notebook-search') {
    panel.open = true;
    if (query) { input.value = query; search(); }
  }
})();
