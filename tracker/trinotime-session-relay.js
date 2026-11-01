(() => {
  const send = type => chrome.runtime.sendMessage({type}).catch(() => null);
  let ending = false;
  let readyTimer = null;
  let readyGeneration = 0;

  async function pairCurrentAgent() {
    const generation = ++readyGeneration;
    const delays = [350, 900, 1800, 3200];
    for (const delay of delays) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (generation !== readyGeneration) return;
      const coverage = await send('cat-pair-trinotime');
      if (!coverage?.ok) continue;
      const confirmation = await send('cft-pair-trinotime');
      if (confirmation?.ok) return;
    }
  }

  window.addEventListener('trinotime:session-ending', () => {
    if (ending) return;
    ending = true;
    readyGeneration++;
    if (readyTimer) clearTimeout(readyTimer);
    Promise.allSettled([send('cat-session-ending'), send('cft-session-ending')])
      .finally(() => setTimeout(() => { ending = false; }, 750));
  }, true);

  window.addEventListener('trinotime:workforce-agent-ready', () => {
    readyGeneration++;
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = setTimeout(() => { pairCurrentAgent().catch(() => {}); }, 250);
  }, true);
})();
