/**
 * Persian typography for the Harness Web UI.
 *
 * Two capabilities live here:
 *  1. A bundled Vazirmatn variable font, registered as a page-level @font-face
 *     and applied through the theme service's text-font preference.
 *  2. A bidi normalizer for conversation text: every text block gets an explicit
 *     direction picked from its own content (majority of Persian vs Latin
 *     letters), lists and tables get a container direction, code stays LTR, and
 *     inline code is isolated so `مثل this` keeps its order.
 *
 * The normalizer is DOM-scoped by the stable `data-conversation-*` and
 * `data-chat-flow-kind` anchors rather than hashed CSS-module class names, and a
 * rAF-coalesced MutationObserver keeps streaming answers aligned as they arrive.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-persian-typography',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace carrying the two settings rows. */
    const NS = 'persianTypography';
    /** Marks elements whose dir attribute this plugin owns. */
    const OWN = 'data-dsh-bidi';
    /** Marks the composer placeholder, whose dir mirrors the editor. */
    const HINT = 'data-dsh-bidi-hint';
    const FONT_FAMILY = 'Vazirmatn';
    const PREFS_KEY = 'dsh.persian-typography.preferences.v1';

    const CHAT_SELECTOR =
      '[data-conversation-session], [data-conversation-region="chat"], [data-conversation-scroll]';
    const USER_ROW_SELECTOR = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]';
    const COMPOSER_SELECTOR = '[data-composer-input]';
    const BLOCK_SELECTOR = 'p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,td,th';
    const GROUP_SELECTOR = 'ul,ol,table';

    const STYLES = `
[data-dsh-bidi="auto"],[data-dsh-bidi="group"]{text-align:start}
[data-dsh-bidi="code"]{direction:ltr;text-align:left;unicode-bidi:isolate}
blockquote[data-dsh-bidi="auto"][dir="rtl"]{
  border-left:0;
  border-right:2px solid var(--dsw-alias-label-caption);
  padding-left:0;
  padding-right:14px;
}
ul[data-dsh-bidi="group"][dir="rtl"],ol[data-dsh-bidi="group"][dir="rtl"]{
  padding-left:0;
  padding-right:18px;
}
[data-conversation-session] :is(code,kbd,samp,var){unicode-bidi:isolate}
[data-conversation-session] :is(.katex,.katex-display){direction:ltr;unicode-bidi:isolate}
[data-composer-input][dir="rtl"]{text-align:right}
[${HINT}][dir="rtl"]{text-align:right}
`;

    /**
     * Vazirmatn variable font (weight 100–900) as base64 WOFF2. Kept as a JS
     * string and registered through the FontFace API instead of a CSS data URL,
     * so a `font-src` CSP can never block it.
     */
    const VAZIRMATN_WOFF2 = '__FONT_BASE64__';

    const EN = {
      'font.title': 'Persian font',
      'font.description':
        'Use the bundled Vazirmatn for conversation text. Fine-tune the full font list under Text font.',
      'direction.title': 'Persian text direction',
      'direction.description':
        'Align every paragraph, list, and table by its own language, keep code left-to-right, and isolate inline code so mixed Persian and English keeps its order.',
    };
    const FA = {
      'font.title': 'فونت فارسی',
      'font.description':
        'استفاده از فونت وزیرمتن برای متن گفتگو. فهرست کامل فونت‌ها را از «فونت متن» تنظیم کنید.',
      'direction.title': 'جهت متن فارسی',
      'direction.description':
        'هم‌ترازی هر پاراگراف، فهرست و جدول بر اساس زبان خودش، نگه‌داشتن کد به‌صورت چپ‌به‌راست و جداسازی کد درون‌خطی تا فارسی و انگلیسی قاطی نشوند.',
    };

    // ---------------------------------------------------------------------
    // Preferences (browser-local; the font choice itself lives in the theme
    // service's persisted text-font setting, so Settings shows one truth).
    // ---------------------------------------------------------------------

    function readPrefs() {
      const fallback = { autoDir: true, fontSeeded: false };
      try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        return {
          autoDir: parsed.autoDir !== false,
          fontSeeded: parsed.fontSeeded === true,
        };
      } catch (error) {
        return fallback;
      }
    }

    function createPrefs() {
      let current = readPrefs();
      const listeners = new Set();
      return {
        get: () => current,
        set(patch) {
          current = Object.freeze({ ...current, ...patch });
          try {
            window.localStorage.setItem(PREFS_KEY, JSON.stringify(current));
          } catch (error) {
            /* storage may be unavailable; the in-memory value still applies */
          }
          for (const listener of [...listeners]) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    // ---------------------------------------------------------------------
    // Direction detection: majority of strong letters, not first-strong, so a
    // Persian sentence that opens with an English word still reads RTL.
    // ---------------------------------------------------------------------

    function measure(text) {
      let rtl = 0;
      let ltr = 0;
      for (let i = 0; i < text.length; i += 1) {
        const c = text.charCodeAt(i);
        if (c < 0x41) continue;
        if (c <= 0x5a || (c >= 0x61 && c <= 0x7a)) {
          ltr += 1;
          continue;
        }
        if (c < 0x00c0) continue;
        if (c >= 0x0590 && c <= 0x08ff) {
          if (c >= 0x0660 && c <= 0x0669) continue;
          if (c >= 0x06f0 && c <= 0x06f9) continue;
          if (
            c === 0x060c ||
            c === 0x061b ||
            c === 0x061f ||
            c === 0x0640 ||
            c === 0x066a ||
            c === 0x066b ||
            c === 0x066c
          ) {
            continue;
          }
          rtl += 1;
          continue;
        }
        if (c >= 0xfb1d && c <= 0xfdff) {
          rtl += 1;
          continue;
        }
        if (c >= 0xfe70 && c <= 0xfeff) {
          rtl += 1;
          continue;
        }
        if (
          (c >= 0x00c0 && c <= 0x024f) ||
          (c >= 0x0370 && c <= 0x058f) ||
          (c >= 0x1e00 && c <= 0x1eff)
        ) {
          ltr += 1;
        }
      }
      return { rtl, ltr };
    }

    /** `rtl`, `ltr`, or null when the text holds no strong letter at all. */
    function directionOf(text) {
      if (!text) return null;
      const { rtl, ltr } = measure(text);
      if (rtl === 0 && ltr === 0) return null;
      if (rtl === 0) return 'ltr';
      if (ltr === 0) return 'rtl';
      // Persian prose with English terms stays RTL; English prose with a short
      // Persian quote stays LTR. Code spans are excluded before this point.
      return rtl / (rtl + ltr) >= 0.35 ? 'rtl' : 'ltr';
    }

    /** Inline code, math, and raw markup must not vote on a paragraph's direction. */
    const SKIP_DIRECTION = 'code,pre,kbd,samp,var,script,style,svg,math';

    /** Concatenate the element's own prose, skipping code and embedded islands. */
    function directionText(element) {
      let text = '';
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3) {
            text += child.nodeValue;
            continue;
          }
          if (child.nodeType !== 1) continue;
          if (child.matches(SKIP_DIRECTION)) continue;
          walk(child);
        }
      };
      walk(element);
      return text;
    }

    function setAttr(element, name, value) {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    }

    function createEngine() {
      let observer = null;
      let frame = 0;
      const pending = new Set();

      function applyBlock(element) {
        if (element.tagName === 'LI' || element.closest('pre')) return;
        if (element.hasAttribute('dir') && !element.hasAttribute(OWN)) return;
        const dir = directionOf(directionText(element));
        if (dir === null) {
          if (element.hasAttribute(OWN)) {
            element.removeAttribute(OWN);
            element.removeAttribute('dir');
          }
          return;
        }
        setAttr(element, 'dir', dir);
        element.setAttribute(OWN, 'auto');
      }

      function applyGroup(element) {
        if (element.hasAttribute('dir') && !element.hasAttribute(OWN)) return;
        const dir = directionOf(directionText(element));
        if (dir === null) {
          element.removeAttribute(OWN);
          element.removeAttribute('dir');
          return;
        }
        setAttr(element, 'dir', dir);
        element.setAttribute(OWN, 'group');
      }

      function applyPre(element) {
        if (element.hasAttribute('dir') && !element.hasAttribute(OWN)) return;
        setAttr(element, 'dir', 'ltr');
        element.setAttribute(OWN, 'code');
      }

      function applyComposer(input) {
        if (!input.isConnected) return;
        const dir = directionOf(directionText(input)) || 'ltr';
        setAttr(input, 'dir', dir);
        input.setAttribute(OWN, 'input');
        const seat = input.closest('[data-composer-seat]') || input.parentElement;
        const hint = seat === null ? null : seat.querySelector(`[${HINT}]`) || seat.querySelector('[data-composer-placeholder]');
        if (hint !== null) {
          setAttr(hint, 'dir', dir);
          hint.setAttribute(HINT, '');
        }
      }

      /** Plain-text user bubbles are divs, not paragraphs: pick them by style. */
      function applyUserRow(row) {
        for (const element of row.querySelectorAll('div')) {
          if (element.hasAttribute(OWN)) {
            applyBlock(element);
            continue;
          }
          if (!element.textContent || element.textContent.trim() === '') continue;
          const style = window.getComputedStyle(element);
          if (style.whiteSpace.indexOf('pre-wrap') !== 0) continue;
          applyBlock(element);
        }
      }

      function scanSubtree(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        for (const pre of root.querySelectorAll('pre')) applyPre(pre);
        for (const group of root.querySelectorAll(GROUP_SELECTOR)) applyGroup(group);
        for (const block of root.querySelectorAll(BLOCK_SELECTOR)) applyBlock(block);
        for (const row of root.querySelectorAll(USER_ROW_SELECTOR)) applyUserRow(row);
        for (const input of root.querySelectorAll(COMPOSER_SELECTOR)) applyComposer(input);
      }

      function scanNode(element) {
        if (!element.isConnected) return;
        const composer = element.closest ? element.closest(COMPOSER_SELECTOR) : null;
        if (composer !== null) {
          applyComposer(composer);
          return;
        }
        if (!element.closest(CHAT_SELECTOR)) return;
        if (element.closest('pre') !== null) return;
        const block = element.closest(BLOCK_SELECTOR);
        if (block !== null) applyBlock(block);
        const group = element.closest(GROUP_SELECTOR);
        if (group !== null) applyGroup(group);
        const row = element.closest(USER_ROW_SELECTOR);
        if (row !== null) applyUserRow(row);
        scanSubtree(element);
      }

      function flush() {
        frame = 0;
        const batch = [...pending];
        pending.clear();
        for (const element of batch) scanNode(element);
      }

      function onRecords(records) {
        for (const record of records) {
          if (record.type === 'characterData') {
            const parent = record.target.parentElement;
            if (parent !== null) pending.add(parent);
            continue;
          }
          for (const node of record.addedNodes) {
            const element = node.nodeType === 1 ? node : node.parentElement;
            if (element !== null && element !== undefined) pending.add(element);
          }
        }
        if (pending.size > 0 && frame === 0) frame = window.requestAnimationFrame(flush);
      }

      function scanAll() {
        const roots = document.querySelectorAll(CHAT_SELECTOR);
        for (const root of roots) {
          if (root.parentElement !== null && root.parentElement.closest(CHAT_SELECTOR) !== null) continue;
          scanSubtree(root);
        }
        for (const input of document.querySelectorAll(COMPOSER_SELECTOR)) applyComposer(input);
      }

      function clearOwned() {
        for (const element of document.querySelectorAll(`[${OWN}]`)) {
          element.removeAttribute(OWN);
          element.removeAttribute('dir');
        }
        for (const element of document.querySelectorAll(`[${HINT}]`)) {
          element.removeAttribute(HINT);
          element.removeAttribute('dir');
        }
      }

      return {
        start() {
          if (observer !== null) return;
          const target = document.body || document.documentElement;
          if (target === null) return;
          observer = new MutationObserver(onRecords);
          observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          scanAll();
        },
        stop() {
          if (observer !== null) {
            observer.disconnect();
            observer = null;
          }
          if (frame !== 0) {
            window.cancelAnimationFrame(frame);
            frame = 0;
          }
          pending.clear();
          clearOwned();
        },
        dispose() {
          this.stop();
        },
        rescan: scanAll,
      };
    }

    // ---------------------------------------------------------------------
    // Settings rows
    // ---------------------------------------------------------------------

    function stripQuotes(name) {
      const trimmed = name.trim();
      if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed[trimmed.length - 1] === trimmed[0]) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    }

    function splitFamilies(value) {
      return String(value || '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');
    }

    function base64ToBytes(base64) {
      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    /** Register the bundled font family for the whole document. */
    function installFont() {
      const fonts = document.fonts;
      if (fonts === undefined || typeof window.FontFace !== 'function') return () => {};
      let face;
      try {
        face = new window.FontFace(FONT_FAMILY, base64ToBytes(VAZIRMATN_WOFF2).buffer, {
          style: 'normal',
          weight: '100 900',
          display: 'swap',
        });
      } catch (error) {
        return () => {};
      }
      fonts.add(face);
      if (typeof face.load === 'function') {
        face.load().catch(() => {
          /* the declared text-font stack falls back gracefully */
        });
      }
      return () => fonts.delete(face);
    }

    function createTranslator(ctx) {
      const locale = ctx.get('locale');
      if (locale === undefined || locale === null) {
        return { t: (key) => EN[key] || key, subscribe: () => () => {} };
      }
      const disposers = [];
      try {
        disposers.push(locale.register(NS, 'en', EN));
        disposers.push(locale.register(NS, 'fa', FA));
      } catch (error) {
        return { t: (key) => EN[key] || key, subscribe: (listener) => locale.subscribe(listener) };
      }
      ctx.effect(
        () => () => {
          for (const dispose of disposers) dispose();
        },
        'persian-typography: locale dictionaries',
      );
      return {
        t: locale.bind(NS),
        subscribe: (listener) => locale.subscribe(listener),
      };
    }

    function createRowComponents(deps) {
      const { ctx, prefs, theme, translator } = deps;
      const t = translator.t;

      function Row(props) {
        return h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px 0',
              borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
            },
          },
          h(
            'div',
            { style: { minWidth: 0, flex: '1 1 auto' } },
            h(
              'div',
              {
                style: {
                  color: 'var(--dsw-alias-label-primary)',
                  fontSize: '14px',
                  lineHeight: '22px',
                },
              },
              props.title,
            ),
            h(
              'div',
              {
                style: {
                  color: 'var(--dsw-alias-label-tertiary)',
                  fontSize: '12px',
                  lineHeight: '18px',
                },
              },
              props.description,
            ),
          ),
          props.children,
        );
      }

      function Switch(props) {
        return h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': props.checked,
            'aria-label': props.label,
            onClick: props.onChange,
            style: {
              position: 'relative',
              flex: 'none',
              width: '44px',
              height: '26px',
              padding: 0,
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              background: props.checked
                ? 'var(--dsw-alias-state-business-primary, #4176e6)'
                : 'var(--dsw-alias-bg-module-platform, #d4d4d4)',
              transition: 'background-color .15s var(--ds-ease-in-out)',
            },
          },
          h('span', {
            'aria-hidden': true,
            style: {
              position: 'absolute',
              top: '3px',
              left: props.checked ? '21px' : '3px',
              width: '20px',
              height: '20px',
              borderRadius: '999px',
              background: 'var(--dsw-alias-switch-thumb, #fff)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, .3)',
              transition: 'left .15s var(--ds-ease-in-out)',
            },
          }),
        );
      }

      function useSignals() {
        const [, bump] = React.useState(0);
        React.useEffect(
          () => translator.subscribe(() => bump((value) => value + 1)),
          [],
        );
        return bump;
      }

      function FontRow() {
        const [, bump] = React.useState(0);
        React.useEffect(
          () => translator.subscribe(() => bump((value) => value + 1)),
          [],
        );
        React.useEffect(() => {
          if (theme === null) return undefined;
          return ctx.on('theme/change', () => bump((value) => value + 1));
        }, []);
        const families = theme === null ? '' : theme.getTheme().fontFamilies.text;
        const list = splitFamilies(families);
        const active = list.some((name) => stripQuotes(name).toLowerCase() === FONT_FAMILY.toLowerCase());
        const toggle = () => {
          if (theme === null) return;
          const next = active
            ? list.filter((name) => stripQuotes(name).toLowerCase() !== FONT_FAMILY.toLowerCase())
            : [FONT_FAMILY, ...list];
          try {
            theme.setFontFamily('text', next.join(', '));
          } catch (error) {
            /* a rejected write leaves the previous preference untouched */
          }
        };
        return h(
          Row,
          { title: t('font.title'), description: t('font.description') },
          h(Switch, { checked: active, onChange: toggle, label: t('font.title') }),
        );
      }

      function DirectionRow() {
        useSignals();
        const [state, setState] = React.useState(prefs.get());
        React.useEffect(() => prefs.subscribe(() => setState(prefs.get())), []);
        return h(
          Row,
          { title: t('direction.title'), description: t('direction.description') },
          h(Switch, {
            checked: state.autoDir,
            onChange: () => prefs.set({ autoDir: !prefs.get().autoDir }),
            label: t('direction.title'),
          }),
        );
      }

      return { FontRow, DirectionRow };
    }

    function apply(ctx) {
      const theme = ctx.get('theme') ?? ctx.theme ?? null;
      const prefs = createPrefs();
      const translator = createTranslator(ctx);
      const engine = createEngine();

      ctx.effect(() => installFont(), 'persian-typography: font registration');

      ctx.effect(
        () => {
          const tag = document.createElement('style');
          tag.dataset.plugin = '@local/dsh-persian-typography';
          tag.dataset.pluginCss = '@local/dsh-persian-typography/typography.css';
          tag.textContent = STYLES;
          document.head.appendChild(tag);
          return () => tag.remove();
        },
        'persian-typography: stylesheet',
      );

      // First run: adopt Vazirmatn only when no text font was chosen yet, so an
      // explicit user preference (or another plugin's) is never overwritten.
      if (!prefs.get().fontSeeded) {
        prefs.set({ fontSeeded: true });
        if (theme !== null && theme.getTheme().fontFamilies.text === '') {
          try {
            theme.setFontFamily('text', FONT_FAMILY);
          } catch (error) {
            /* ignore: the settings row still offers the switch */
          }
        }
      }

      ctx.effect(
        () => {
          const unsubscribe = prefs.subscribe(() => {
            if (prefs.get().autoDir) engine.start();
            else engine.stop();
          });
          if (prefs.get().autoDir) engine.start();
          return () => {
            unsubscribe();
            engine.dispose();
          };
        },
        'persian-typography: direction engine',
      );

      const rows = createRowComponents({ ctx, prefs, theme, translator });
      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          { name: 'settings.general.item', id: 'persian-direction', order: 13 },
          rows.DirectionRow,
        ),
      );
      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          { name: 'settings.general.item', id: 'persian-font', order: 14 },
          rows.FontRow,
        ),
      );
    }

    return {
      inject: ['slots', 'theme'],
      apply,
    };
  },
});
