import { GAME_RULES } from '../data/rules.js';

const GAME_SCREEN_TYPES = Object.freeze({
  gameHome: 'whoami', setup: 'whoami', prep: 'whoami', reveal: 'whoami', starting: 'whoami',
  playing: 'whoami', scoring: 'whoami', results: 'whoami', finish: 'whoami', whoamiLocalFinalReveal: 'whoami',
  chupisticaSetup: 'chupistica', chupisticaWheel: 'chupistica',
  ageMode: 'age', ageSetup: 'age', agePreparation: 'age', ageReveal: 'age', agePlaying: 'age', ageLocalFinalReveal: 'age',
  confessionsMode: 'confessions', confessionsSetup: 'confessions', confessionsWriting: 'confessions',
  confessionsVoting: 'confessions', confessionsResults: 'confessions', confessionsScoreboard: 'confessions',
  chamuyayaHome: 'chamuyaya', chamuyayaOnlineSetup: 'chamuyaya', chamuyayaSetup: 'chamuyaya',
  chamuyayaCountdown: 'chamuyaya', chamuyayaReveal: 'chamuyaya', chamuyayaDiscussion: 'chamuyaya',
  chamuyayaVoting: 'chamuyaya', chamuyayaResult: 'chamuyaya', chamuyayaLocalReveal: 'chamuyaya',
  chamuyayaLocalDiscussion: 'chamuyaya', chamuyayaLocalVoting: 'chamuyaya', chamuyayaLocalResult: 'chamuyaya',
  tribunalSetup: 'tribunal', tribunalRoles: 'tribunal', tribunalPresentation: 'tribunal', tribunalDebate: 'tribunal',
  tribunalSurprise: 'tribunal', tribunalFinal: 'tribunal', tribunalVoting: 'tribunal', tribunalResult: 'tribunal', tribunalFinalResult: 'tribunal',
  stopSetup: 'stop', stopReveal: 'stop', stopPlaying: 'stop', stopReview: 'stop',
  whatWouldYouDoSetup: 'whatwouldyoudo', whatWouldYouDoPlaying: 'whatwouldyoudo', whatWouldYouDoResult: 'whatwouldyoudo'
});

const GAME_SCREENS = new Set([...Object.keys(GAME_SCREEN_TYPES), 'lobby', 'miniResults', 'miniFinish']);

function safeText(value) {
  return String(value ?? '');
}

export function createRulesController({ state, rules = GAME_RULES } = {}) {
  let openButton = null;
  let overlay = null;
  let closeButton = null;
  let footerCloseButton = null;
  let lastFocused = null;
  let bound = false;

  function currentGameType(screenId = state?.currentScreen || '') {
    const direct = safeText(state?.gameType).trim().toLowerCase();
    if (rules[direct]) return direct;
    const roomType = safeText(state?.lastRoomData?.game?.gameType || state?.lastRoomData?.gameType).trim().toLowerCase();
    if (rules[roomType]) return roomType;
    return GAME_SCREEN_TYPES[screenId] || '';
  }

  function isVisible() {
    return Boolean(overlay?.classList.contains('show'));
  }

  function addText(parent, tag, value, className = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = safeText(value);
    parent.appendChild(element);
    return element;
  }

  function renderDemo(parent, demo) {
    if (!demo) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'rules-demo';
    const header = document.createElement('div');
    header.className = 'rules-demo-head';
    addText(header, 'span', '▸', 'rules-demo-mark');
    addText(header, 'strong', demo.label, 'rules-demo-title');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'rules-demo-toggle';
    toggle.textContent = 'VER EJEMPLO';
    toggle.setAttribute('aria-expanded', 'false');
    header.appendChild(toggle);
    const body = document.createElement('div');
    body.className = 'rules-demo-body';
    body.hidden = true;
    (demo.items || []).forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'rules-demo-item';
      addText(row, 'span', String(index + 1).padStart(2, '0'), 'rules-demo-index');
      addText(row, 'span', item, 'rules-demo-text');
      body.appendChild(row);
    });
    toggle.addEventListener('click', () => {
      const next = body.hidden;
      body.hidden = !next;
      toggle.setAttribute('aria-expanded', String(next));
      toggle.textContent = next ? 'OCULTAR EJEMPLO' : 'VER EJEMPLO';
      wrapper.classList.toggle('is-open', next);
    });
    wrapper.append(header, body);
    parent.appendChild(wrapper);
  }

  function renderCards(parent, cards) {
    if (!Array.isArray(cards) || !cards.length) return;
    const grid = document.createElement('div');
    grid.className = 'rules-info-grid';
    cards.forEach(card => {
      const item = document.createElement('div');
      item.className = 'rules-info-card';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rules-info-card-button';
      button.setAttribute('aria-expanded', 'false');
      addText(button, 'span', card.icon, 'rules-info-card-icon');
      const title = document.createElement('span');
      title.className = 'rules-info-card-title';
      title.textContent = safeText(card.title);
      button.appendChild(title);
      addText(button, 'span', '+', 'rules-info-card-plus');
      const detail = document.createElement('div');
      detail.className = 'rules-info-card-detail';
      detail.hidden = true;
      detail.textContent = safeText(card.text);
      button.addEventListener('click', () => {
        const next = detail.hidden;
        detail.hidden = !next;
        button.setAttribute('aria-expanded', String(next));
        item.classList.toggle('is-open', next);
      });
      item.append(button, detail);
      grid.appendChild(item);
    });
    parent.appendChild(grid);
  }

  function renderSection(section) {
    const article = document.createElement('article');
    article.className = 'rules-section';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rules-section-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `rules-panel-${section.id}`);
    addText(button, 'span', section.icon, 'rules-section-icon');
    addText(button, 'span', section.title, 'rules-section-title');
    addText(button, 'span', '+', 'rules-section-plus');
    const panel = document.createElement('div');
    panel.className = 'rules-section-panel';
    panel.id = `rules-panel-${section.id}`;
    panel.hidden = true;
    (section.paragraphs || []).forEach(text => addText(panel, 'p', text, 'rules-paragraph'));
    if (Array.isArray(section.bullets) && section.bullets.length) {
      const list = document.createElement('ul');
      list.className = 'rules-bullet-list';
      section.bullets.forEach(item => addText(list, 'li', item));
      panel.appendChild(list);
    }
    renderCards(panel, section.cards);
    renderDemo(panel, section.demo);
    if (section.note) addText(panel, 'div', section.note, 'rules-note');
    button.addEventListener('click', () => {
      const next = panel.hidden;
      panel.hidden = !next;
      button.setAttribute('aria-expanded', String(next));
      article.classList.toggle('is-open', next);
    });
    article.append(button, panel);
    return article;
  }

  function renderRulebook(type) {
    const content = rules[type];
    if (!content || !overlay) return false;
    const title = document.getElementById('rulesTitle');
    const subtitle = document.getElementById('rulesSubtitle');
    const badge = document.getElementById('rulesContextBadge');
    const modes = document.getElementById('rulesModes');
    const steps = document.getElementById('rulesSteps');
    const viewer = document.getElementById('rulesStepViewer');
    const sections = document.getElementById('rulesSections');
    if (title) title.textContent = `${content.emoji} ${content.title}`;
    if (subtitle) subtitle.textContent = 'Guía rápida para entender qué hacer en cada momento.';
    if (badge) badge.textContent = `${content.emoji} ${content.title}`;
    if (modes) {
      modes.replaceChildren();
      (content.modes || []).forEach(mode => {
        const chip = document.createElement('div');
        chip.className = 'rules-mode-chip';
        addText(chip, 'span', mode.icon, 'rules-mode-icon');
        const copy = document.createElement('span');
        addText(copy, 'strong', mode.label);
        addText(copy, 'small', mode.text);
        chip.appendChild(copy);
        modes.appendChild(chip);
      });
    }
    if (steps) {
      steps.replaceChildren();
      (content.steps || []).forEach((step, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.className = `rules-step-button${index === 0 ? ' is-active' : ''}`;
        button.setAttribute('aria-selected', String(index === 0));
        addText(button, 'span', String(index + 1).padStart(2, '0'), 'rules-step-number');
        addText(button, 'span', step.title, 'rules-step-label');
        button.addEventListener('click', () => {
          steps.querySelectorAll('.rules-step-button').forEach(item => {
            const active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-selected', String(active));
          });
          if (viewer) {
            viewer.replaceChildren();
            addText(viewer, 'strong', step.title, 'rules-step-viewer-title');
            addText(viewer, 'p', step.text, 'rules-step-viewer-copy');
          }
        });
        steps.appendChild(button);
      });
    }
    if (viewer) {
      viewer.replaceChildren();
      const first = content.steps?.[0];
      if (first) {
        addText(viewer, 'strong', first.title, 'rules-step-viewer-title');
        addText(viewer, 'p', first.text, 'rules-step-viewer-copy');
      }
    }
    if (sections) {
      sections.replaceChildren();
      (content.sections || []).forEach(section => sections.appendChild(renderSection(section)));
    }
    return true;
  }

  function open() {
    const type = currentGameType();
    if (!type || !rules[type] || !overlay) return;
    if (!renderRulebook(type)) return;
    lastFocused = document.activeElement;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('rules-open');
    document.body.dataset.rulesPreviousOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButton?.focus({ preventScroll: true }), 0);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('rules-open');
    document.body.style.overflow = document.body.dataset.rulesPreviousOverflow || '';
    delete document.body.dataset.rulesPreviousOverflow;
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus({ preventScroll: true }); } catch (error) { lastFocused.focus(); }
    }
  }

  function sync(screenId = state?.currentScreen || '') {
    if (!openButton) return;
    const shouldShow = GAME_SCREENS.has(screenId) && Boolean(currentGameType(screenId));
    openButton.classList.toggle('hidden', !shouldShow);
    openButton.setAttribute('aria-hidden', String(!shouldShow));
    openButton.tabIndex = shouldShow ? 0 : -1;
    if (!shouldShow && isVisible()) close();
  }

  function bind() {
    if (bound) return;
    openButton = document.getElementById('openRulesBtn');
    overlay = document.getElementById('rulesOverlay');
    closeButton = document.getElementById('closeRulesBtn');
    footerCloseButton = document.getElementById('rulesFooterCloseBtn');
    if (!openButton || !overlay) return;
    bound = true;
    openButton.addEventListener('click', open);
    closeButton?.addEventListener('click', close);
    footerCloseButton?.addEventListener('click', close);
    overlay.querySelector('[data-rules-backdrop]')?.addEventListener('click', close);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isVisible()) {
        event.preventDefault();
        close();
      }
    });
    sync();
  }

  return { bind, open, close, sync, currentGameType };
}
