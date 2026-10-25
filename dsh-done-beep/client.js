/**
 * Client half of the done-beep bundle.
 *
 * Lives in the frame-wide overlay, so it stays mounted whichever panel or
 * conversation is on screen. `useSessionStatus` is the frame-wide Session status
 * source (the same one that drives completion dots): a top-level Session whose
 * `running` leaves `true` for `false` has just finished a Turn, which is exactly
 * the moment to beep. Subagent Sessions are skipped so one answer still produces
 * one sound, and a Session first observed while idle stays silent.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-done-beep',
  factory(require) {
    const React = require('react');

    /** First tone of the chime: a clear A5 that carries over background noise. */
    const FIRST_HZ = 880;
    /** Second tone a little brighter, so the pair reads as "done" rather than an alarm. */
    const SECOND_HZ = 1174.66;

    /** Shared AudioContext, created on first use so module loading stays side-effect free. */
    let audio;

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
     * Schedule one enveloped sine tone. The exponential envelope keeps the short
     * burst from clicking at either edge.
     * @param ctx - context that owns the nodes.
     * @param when - context time to start at.
     * @param frequency - tone pitch in hertz.
     * @param duration - audible length in seconds.
     * @param peak - peak gain, 0..1.
     */
    function tone(ctx, when, frequency, duration, peak) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(when);
      oscillator.stop(when + duration + 0.05);
    }

    /** Emit the two-tone chime once the context is allowed to make sound. */
    function emit() {
      const ctx = audioContext();
      if (ctx === undefined) return;
      const start = ctx.currentTime + 0.01;
      tone(ctx, start, FIRST_HZ, 0.18, 0.22);
      tone(ctx, start + 0.16, SECOND_HZ, 0.28, 0.2);
    }

    /**
     * Play the completion chime. A suspended context is resumed first: browsers
     * hold audio back until the page sees a gesture, and every prompt provides one.
     */
    function chime() {
      const ctx = audioContext();
      if (ctx === undefined) return;
      if (ctx.state === 'suspended') {
        const resumed = ctx.resume();
        if (resumed === undefined) emit();
        else resumed.then(emit, () => {});
        return;
      }
      if (ctx.state === 'running') emit();
    }

    /**
     * Headless frame-wide watcher of Session running state.
     * @param props - global Slot kit share: the status map and the catalog rows
     *   that identify subagent Sessions.
     * @returns null, since this entry never draws anything.
     */
    function DoneBeep({ useSessionStatus, useSessions }) {
      const statuses = useSessionStatus((snapshot) => snapshot);
      const rows = useSessions((snapshot) => snapshot.byId);
      const previous = React.useRef(undefined);
      React.useEffect(() => {
        const before = previous.current;
        previous.current = statuses;
        if (before === undefined) return;
        let finished = false;
        for (const [sessionId, status] of statuses) {
          if (before.get(sessionId)?.running !== true) continue;
          if (status.running !== false) continue;
          if (rows[sessionId]?.origin === 'subagent') continue;
          finished = true;
          break;
        }
        if (finished) chime();
      }, [statuses, rows]);
      return null;
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const unlock = () => {
            const ctx = audioContext();
            if (ctx === undefined || ctx.state !== 'suspended') return;
            ctx.resume().catch(() => {});
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
        }, 'done-beep: audio unlock');
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'done-beep',
          order: 50,
        }, DoneBeep));
      },
    };
  },
});
