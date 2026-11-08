/**
 * Client half of the done-beep bundle.
 *
 * Lives in the frame-wide overlay, so it stays mounted whichever panel or
 * conversation is on screen. `useSessionStatus` is the frame-wide Session status
 * source (the same one that drives completion dots). Two edges matter:
 * a top-level Session whose `running` leaves `true` for `false` has just
 * finished a Turn, and a Session that gains a `pendingInteraction` is waiting
 * for the user. Both chime and notify; Subagent Sessions are skipped for
 * completions so one answer still produces one sound, while a question from any
 * Session still reaches the user. A Session first observed while idle stays silent.
 *
 * A finished answer plays an ascending two-tone chime; a pending question plays
 * a short double pip so the two are told apart by ear. Both show an in-page card
 * and raise a desktop notification when the window is not focused.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-done-beep',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace carried by the registered entry. */
    const NS = 'done-beep';

    /** Copy for every shipped locale plus the user's language as a language-pack dictionary. */
    const DICT = {
      en: {
        'toast.title': 'Response ready',
        'toast.body': 'The assistant finished working.',
        'ask.title': 'Your input is needed',
        'ask.body': 'The assistant is waiting for your answer.',
        'toast.close': 'Dismiss notification',
      },
      fa: {
        'toast.title': 'پاسخ آماده شد',
        'toast.body': 'کار دستیار تمام شد.',
        'ask.title': 'به پاسخ تو نیاز است',
        'ask.body': 'دستیار منتظر پاسخ توست.',
        'toast.close': 'بستن اعلان',
      },
      zh: {
        'toast.title': '回复已就绪',
        'toast.body': '助手已完成工作。',
        'ask.title': '需要你的回答',
        'ask.body': '助手正在等待你的回复。',
        'toast.close': '关闭通知',
      },
    };

    /** Intro motion for the card; removed with the card when it unmounts. */
    const STYLE = [
      '@keyframes dsh-done-beep-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion: reduce){[data-done-beep-toast]{animation:none!important}}',
    ].join('');

    /** Bell spectrum: fundamental plus two decaying partials, which reads clearer than a plain sine. */
    const PARTIALS = [
      [1, 1],
      [2, 0.5],
      [3, 0.28],
    ];

    /**
     * Cue patterns as [offset seconds, frequency, duration, peak]. `done` rises
     * B5 to E6; `ask` repeats E6 as a short double pip so the two cues differ by
     * ear without needing a second sound source.
     */
    const CUES = {
      done: [
        [0, 987.77, 0.22, 0.55],
        [0.19, 1318.51, 0.5, 0.5],
      ],
      ask: [
        [0, 1318.51, 0.12, 0.5],
        [0.17, 1318.51, 0.12, 0.5],
      ],
    };

    /** Shared AudioContext, created on first use so module loading stays side-effect free. */
    let audio;
    /** Notification permission is requested at most once per page life. */
    let permissionAsked = false;

    /**
     * Resolve the shared AudioContext, or undefined when the browser has none.
     * @returns the shared context.
     */
    function audioContext() {
      if (audio !== undefined) return audio;
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (typeof Ctor !== 'function') return undefined;
      try {
        audio = new Ctor();
      } catch {
        audio = undefined;
      }
      return audio;
    }

    /**
     * Schedule one bell tone: every partial gets a fast attack and a two-stage
     * exponential decay, so the note lands distinct instead of clicky or dull.
     * @param ctx - context that owns the nodes.
     * @param output - node the partials mix into.
     * @param when - context time to start at.
     * @param frequency - fundamental pitch in hertz.
     * @param duration - audible length in seconds.
     * @param peak - peak gain of the fundamental, 0..1.
     */
    function tone(ctx, output, when, frequency, duration, peak) {
      for (const [ratio, weight] of PARTIALS) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const level = Math.max(0.0001, peak * weight);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency * ratio, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(level, when + 0.008);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.3), when + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        oscillator.connect(gain);
        gain.connect(output);
        oscillator.start(when);
        oscillator.stop(when + duration + 0.05);
      }
    }

    /**
     * Emit one cue through a single master gain so the summed partials cannot clip.
     * @param cue - key into {@link CUES}.
     */
    function emit(cue) {
      const ctx = audioContext();
      if (ctx === undefined) return;
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      const start = ctx.currentTime + 0.01;
      for (const [offset, frequency, duration, peak] of CUES[cue]) {
        tone(ctx, master, start + offset, frequency, duration, peak);
      }
    }

    /**
     * Play one cue. A suspended context is resumed first: browsers hold audio
     * back until the page sees a gesture, and every prompt provides one.
     * @param cue - 'done' for a finished answer, 'ask' for a pending question.
     */
    function play(cue) {
      const ctx = audioContext();
      if (ctx === undefined) return;
      if (ctx.state === 'suspended') {
        const resumed = ctx.resume();
        if (resumed === undefined) emit(cue);
        else resumed.then(() => emit(cue), () => {});
        return;
      }
      if (ctx.state === 'running') emit(cue);
    }

    /**
     * Resolve the Notification constructor where the browser has one.
     * @returns the constructor, or undefined.
     */
    function notificationCtor() {
      const Ctor = window.Notification;
      return typeof Ctor === 'function' ? Ctor : undefined;
    }

    /**
     * Ask for notification permission once, from a user gesture. Browsers refuse
     * the prompt outside one, so this rides the same listeners as the audio unlock.
     */
    function requestPermission() {
      const Ctor = notificationCtor();
      if (Ctor === undefined || permissionAsked || Ctor.permission !== 'default') return;
      permissionAsked = true;
      try {
        const pending = Ctor.requestPermission();
        if (pending !== undefined) pending.catch(() => {});
      } catch {}
    }

    /**
     * Raise one desktop notification for a completion the user cannot see.
     * @param title - notification title.
     * @param body - notification body.
     */
    function desktopNotify(title, body) {
      const Ctor = notificationCtor();
      if (Ctor === undefined || Ctor.permission !== 'granted') return;
      try {
        const notification = new Ctor(title, { body, tag: 'dsh-done-beep' });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {}
    }

    /** Card frame: themed surface, elevation, and pointer opt-in for the click-through overlay layer. */
    const CARD = {
      position: 'fixed',
      insetInlineEnd: '24px',
      bottom: '24px',
      zIndex: 2147483000,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      width: 'min(360px, calc(100vw - 32px))',
      padding: '12px 12px 12px 14px',
      borderRadius: '12px',
      background: 'var(--dsw-alias-bg-overlay)',
      color: 'var(--dsw-alias-label-primary)',
      border: '1px solid var(--dsw-alias-border-l1)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
      pointerEvents: 'auto',
      animation: 'dsh-done-beep-in 180ms ease-out',
    };

    /** Square, borderless dismiss button. */
    const CLOSE = {
      flex: 'none',
      width: '20px',
      height: '20px',
      padding: 0,
      border: 'none',
      borderRadius: '6px',
      background: 'transparent',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '14px',
      lineHeight: '20px',
      cursor: 'pointer',
    };

    /**
     * Frame-wide watcher of two Session events, plus the card both share.
     * @param props - global Slot kit share (status map and catalog rows) and the
     *   entry's localized `t`.
     * @returns the card while one is shown, otherwise null.
     */
    function DoneBeep({ useSessionStatus, useSessions, t }) {
      const statuses = useSessionStatus((snapshot) => snapshot);
      const rows = useSessions((snapshot) => snapshot.byId);
      const [toast, setToast] = React.useState(undefined);
      const previous = React.useRef(undefined);

      React.useEffect(() => {
        const before = previous.current;
        previous.current = statuses;
        if (before === undefined) return;
        let asked;
        let finished;
        for (const [sessionId, status] of statuses) {
          const prior = before.get(sessionId);
          if (prior === undefined) continue;
          const ask = status.pendingInteraction;
          if (ask !== undefined && ask.key !== prior.pendingInteraction?.key) {
            if (asked === undefined) asked = sessionId;
            continue;
          }
          if (ask !== undefined) continue;
          if (rows[sessionId]?.origin === 'subagent') continue;
          if (prior.running === true && status.running === false && finished === undefined) finished = sessionId;
        }
        const kind = asked !== undefined ? 'ask' : finished !== undefined ? 'done' : undefined;
        if (kind === undefined) return;
        const sessionId = asked ?? finished;
        const body = rows[sessionId]?.displayTitle ?? t(kind === 'ask' ? 'ask.body' : 'toast.body');
        play(kind);
        setToast({ kind, body, at: Date.now() });
        const hidden = document.visibilityState !== 'visible' || !document.hasFocus();
        if (hidden) desktopNotify(t(kind === 'ask' ? 'ask.title' : 'toast.title'), body);
      }, [statuses, rows, t]);

      React.useEffect(() => {
        if (toast === undefined) return;
        const timer = setTimeout(() => setToast(undefined), 6000);
        return () => clearTimeout(timer);
      }, [toast]);

      if (toast === undefined) return null;
      return h(React.Fragment, null,
        h('style', { key: 'motion' }, STYLE),
        h('div', {
          key: 'toast',
          'data-done-beep-toast': true,
          role: 'status',
          style: CARD,
        },
          h('svg', {
            width: 18,
            height: 18,
            viewBox: '0 0 20 20',
            'aria-hidden': true,
            style: { flex: 'none', marginTop: '1px' },
          },
            h('circle', {
              cx: 10,
              cy: 10,
              r: 9,
              fill: toast.kind === 'ask' ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-state-success-primary)',
            }),
            toast.kind === 'ask'
              ? h('text', {
                x: 10,
                y: 14.2,
                textAnchor: 'middle',
                fontSize: '12',
                fontWeight: 700,
                fill: '#ffffff',
              }, '?')
              : h('path', {
                d: 'M6 10.2l2.6 2.6L14 7.4',
                fill: 'none',
                stroke: '#ffffff',
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }),
          ),
          h('div', { style: { flex: '1', minWidth: 0, textAlign: 'start' } },
            h('div', {
              style: { fontSize: '13px', fontWeight: 600, lineHeight: '18px' },
            }, t(toast.kind === 'ask' ? 'ask.title' : 'toast.title')),
            h('div', {
              style: {
                marginTop: '2px',
                fontSize: '12px',
                lineHeight: '16px',
                color: 'var(--dsw-alias-label-secondary)',
                overflowWrap: 'anywhere',
              },
            }, toast.body),
          ),
          h('button', {
            type: 'button',
            'aria-label': t('toast.close'),
            title: t('toast.close'),
            onClick: () => setToast(undefined),
            style: CLOSE,
          }, '×'),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', DICT.en), 'done-beep: en dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT.zh), 'done-beep: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'fa', DICT.fa), 'done-beep: fa dictionary');
        ctx.effect(() => {
          const unlock = () => {
            const ctx = audioContext();
            if (ctx !== undefined && ctx.state === 'suspended') ctx.resume().catch(() => {});
            requestPermission();
          };
          window.addEventListener('pointerdown', unlock, true);
          window.addEventListener('keydown', unlock, true);
          return () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            if (audio === undefined) return;
            audio.close().catch(() => {});
            audio = undefined;
          };
        }, 'done-beep: audio and notification unlock');
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'done-beep',
          order: 50,
          locale: NS,
        }, DoneBeep));
      },
    };
  },
});
