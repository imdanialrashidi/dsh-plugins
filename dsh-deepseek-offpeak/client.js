/**
 * Client half of the DeepSeek off-peak clock.
 *
 * Registers one widget in the frame-wide `shell.overlay` slot: a small pill in
 * the bottom-right corner that always shows the current billing state and the
 * countdown to the next switch, and opens a panel with today's peak windows on
 * a 24-hour ruler plus the model calls that were made during peak hours.
 *
 * All time math runs in Tehran wall-clock time (UTC+03:30, no DST) while the
 * rule itself is defined in UTC by the DeepSeek price list.
 *
 * Persian copy lives in this file because the Harness ships only `en`/`zh`
 * dictionaries; `STR` is the only place text needs editing to translate it.
 *
 * @module @local/dsh-deepseek-offpeak/client
 */

window.__ModuleLoader__.load({
  id: "@local/dsh-deepseek-offpeak",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var h = React.createElement;

    var inject = ["slots"];

    var USAGE_URL = "/plugins/deepseek-offpeak/usage?days=7";
    var POLL_MS = 60000;

    /* Tokyo is not involved; Tehran is UTC+03:30 since Iran dropped DST. */
    var TEHRAN_OFFSET_MIN = 210;

    /** DeepSeek peak windows as local minutes-from-midnight: 04:30–07:30, 09:30–13:30. */
    var LOCAL_PEAK_WINDOWS = [
      [270, 450],
      [570, 810],
    ];

    var WEEKDAY_NAMES = {
      0: "یکشنبه",
      1: "دوشنبه",
      2: "سه‌شنبه",
      3: "چهارشنبه",
      4: "پنجشنبه",
      5: "جمعه",
      6: "شنبه",
    };

    var STR = {
      pillOff: "آفلپیک",
      pillPeak: "اوج",
      pillHintOff: "تا اوج",
      pillHintPeak: "تا آفلپیک",
      open: "نمایش ساعت آفلپیک دیپسیک",
      title: "ساعت آفلپیک دیپسیک",
      subtitle: "تهران · UTC+۳:۳۰",
      close: "بستن",
      stateOff: "خارج از بازه اوج",
      statePeak: "در بازه اوج",
      captionOff: "تا شروع بازه اوج",
      captionPeak: "تا پایان بازه اوج",
      discount: "نرخ آفلپیک نصف نرخ اوج است",
      today: "امروز",
      todayEmpty: "امروز روز اوج نیست؛ شنبه و یکشنبه سراسر آفلپیک‌اند.",
      windowPast: "گذشت",
      windowNow: "در جریان",
      windowNext: "بعدی",
      nextWindow: "بازه بعدی",
      alertTitle: "در ساعت اوج مصرف کردی",
      alertBody: "درخواست‌های زیر در بازه اوج ثبت شده‌اند و با نرخ کامل حساب می‌شوند.",
      quiet: "امروز در بازه اوج درخواستی ثبت نشده",
      week: "۷ روز اخیر",
      calls: "درخواست",
      rule: "قاعده (OpenCode Go و API دیپ‌سیک): اوج دوشنبه تا جمعه، ۰۱:۰۰–۰۴:۰۰ و ۰۶:۰۰–۱۰:۰۰ UTC است؛ معادل ۰۴:۳۰–۰۷:۳۰ و ۰۹:۳۰–۱۳:۳۰ تهران. بقیه ساعت‌ها و همه شنبه و یکشنبه آفلپیک‌اند و هر توکن نصف سهمیه می‌خورد.",
      tooltip: "برای دیدن بازه‌های اوج کلیک کن",
      toast: "درخواست تازه در بازه اوج ثبت شد",
      usageError: "خواندن تاریخچه مصرف ممکن نشد",
      source: "بر پایه قیمت‌گذاری رسمی API دیپسیک",
      refreshed: "آخرین به‌روزرسانی",
    };

    var FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

    function fa(value) {
      return String(value).replace(/[0-9]/g, function (digit) {
        return FA_DIGITS[+digit];
      });
    }

    function pad2(value) {
      return value < 10 ? "0" + value : String(value);
    }

    function tehranParts(at) {
      var date = new Date(at + TEHRAN_OFFSET_MIN * 60000);
      return {
        weekday: date.getUTCDay(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
        millisecond: date.getUTCMilliseconds(),
        key:
          date.getUTCFullYear() +
          "-" +
          pad2(date.getUTCMonth() + 1) +
          "-" +
          pad2(date.getUTCDate()),
      };
    }

    function isWeekend(weekday) {
      return weekday === 0 || weekday === 6;
    }

    function isPeakLocal(at) {
      var parts = tehranParts(at);
      if (isWeekend(parts.weekday)) return false;
      var minute = parts.hour * 60 + parts.minute + parts.second / 60;
      return LOCAL_PEAK_WINDOWS.some(function (slot) {
        return minute >= slot[0] && minute < slot[1];
      });
    }

    function startOfLocalDay(at) {
      var parts = tehranParts(at);
      var elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + parts.millisecond;
      return at - elapsed;
    }

    /**
     * Window edges around `at`, two days back and nine days forward: enough that
     * the previous and next edge always exist, including across a weekend.
     */
    function edgesAround(at) {
      var base = startOfLocalDay(at);
      var edges = [];
      for (var day = -2; day <= 9; day += 1) {
        var dayStart = base + day * 86400000;
        if (isWeekend(tehranParts(dayStart).weekday)) continue;
        for (var i = 0; i < LOCAL_PEAK_WINDOWS.length; i += 1) {
          edges.push({ at: dayStart + LOCAL_PEAK_WINDOWS[i][0] * 60000, opens: true });
          edges.push({ at: dayStart + LOCAL_PEAK_WINDOWS[i][1] * 60000, opens: false });
        }
      }
      edges.sort(function (left, right) {
        return left.at - right.at;
      });
      return edges;
    }

    function scheduleAt(at) {
      var edges = edgesAround(at);
      var previous = null;
      var next = null;
      var nextOpening = null;
      for (var i = 0; i < edges.length; i += 1) {
        var edge = edges[i];
        if (edge.at <= at) {
          previous = edge;
          continue;
        }
        if (next === null) next = edge;
        if (edge.opens && nextOpening === null) nextOpening = edge.at;
      }
      var span = next && previous ? next.at - previous.at : 0;
      return {
        peak: isPeakLocal(at),
        previous: previous ? previous.at : at,
        next: next ? next.at : at,
        nextOpening: nextOpening,
        progress: span > 0 ? Math.min(1, Math.max(0, (at - previous.at) / span)) : 0,
      };
    }

    function todayWindows(at) {
      var parts = tehranParts(at);
      var peakDay = !isWeekend(parts.weekday);
      var minute = parts.hour * 60 + parts.minute + parts.second / 60;
      return {
        peakDay: peakDay,
        weekday: parts.weekday,
        windows: LOCAL_PEAK_WINDOWS.map(function (slot) {
          var state = "future";
          if (!peakDay) state = "none";
          else if (minute >= slot[1]) state = "past";
          else if (minute >= slot[0]) state = "now";
          return { start: slot[0], end: slot[1], state: state };
        }),
      };
    }

    function formatClock(minutes) {
      var hour = Math.floor(minutes / 60) % 24;
      var minute = Math.floor(minutes % 60);
      return fa(pad2(hour) + ":" + pad2(minute));
    }

    function formatTime(at) {
      var parts = tehranParts(at);
      return fa(pad2(parts.hour) + ":" + pad2(parts.minute));
    }

    function formatDuration(ms) {
      var total = Math.max(0, Math.floor(ms / 1000));
      var hours = Math.floor(total / 3600);
      var minutes = Math.floor((total % 3600) / 60);
      var seconds = total % 60;
      return fa(pad2(hours) + ":" + pad2(minutes) + ":" + pad2(seconds));
    }

    /** Compact form for the pill: days and hours once the stretch passes a day. */
    function formatShort(ms) {
      var total = Math.max(0, Math.floor(ms / 1000));
      var hours = Math.floor(total / 3600);
      if (hours < 24) return formatDuration(ms);
      var days = Math.floor(hours / 24);
      var minutes = Math.floor((total % 3600) / 60);
      return fa(days) + " روز و " + fa((hours % 24) + ":" + pad2(minutes));
    }

    function isDeepseekCall(label) {
      if (typeof label !== "string" || !/deepseek/i.test(label)) return false;
      // Free models do not draw on the paid allowance, so they cannot be "peak spending".
      return !/free/i.test(label);
    }

    function summarizePeakUsage(calls, at) {
      var today = tehranParts(at).key;
      var summary = { today: [], week: 0 };
      for (var i = 0; i < calls.length; i += 1) {
        var entry = calls[i];
        if (!Array.isArray(entry) || entry[1] !== 1) continue;
        if (!isDeepseekCall(entry[2])) continue;
        var stamp = entry[0];
        if (!Number.isFinite(stamp)) continue;
        summary.week += 1;
        if (tehranParts(stamp).key === today) summary.today.push(stamp);
      }
      summary.today.sort(function (left, right) {
        return left - right;
      });
      return summary;
    }

    var CSS = `
.ddo_root{position:fixed;left:16px;bottom:58px;z-index:40;display:flex;flex-direction:column;align-items:flex-start;gap:10px;direction:ltr;font-family:inherit;pointer-events:none}
.ddo_root>*{pointer-events:auto}
.ddo_pill{direction:rtl;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px 0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:1;cursor:pointer;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);transition:transform var(--ds-transition-duration-fast) var(--ds-ease-in-out),box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out),border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}
.ddo_pill:hover{transform:translateY(-1px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary)}
.ddo_pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ddo_pill[data-state=peak]{border-color:var(--dsw-alias-state-warn-primary)}
.ddo_dot{position:relative;flex:none;width:8px;height:8px;border-radius:50%;background:currentColor;color:var(--dsw-alias-state-success-primary)}
.ddo_pill[data-state=peak] .ddo_dot{color:var(--dsw-alias-state-warn-primary)}
.ddo_dot::after{content:"";position:absolute;inset:-3px;border-radius:50%;background:currentColor;opacity:.18}
.ddo_pill[data-state=peak] .ddo_dot::before{content:"";position:absolute;inset:0;border-radius:50%;background:currentColor;animation:ddoPulse 2.4s var(--ds-ease-in-out) infinite}
@keyframes ddoPulse{0%{transform:scale(.85);opacity:.45}70%{transform:scale(2);opacity:0}100%{opacity:0}}
.ddo_pillLabel{font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}
.ddo_pillTimer{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ddo_pillHint{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.ddo_pill[data-flash=true]{border-color:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 3px var(--dsw-alias-state-warn-tertiary),var(--dsw-shadow-lv3)}
.ddo_toast{display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:12px;border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label);font-size:11.5px;box-shadow:var(--dsw-shadow-lv2);animation:ddoIn .18s var(--ds-ease-in-out);direction:rtl}
.ddo_pillAlert{display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
.ddo_panel{direction:rtl;width:min(372px,calc(100vw - 32px));max-height:min(78vh,672px);display:flex;flex-direction:column;border-radius:18px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3);overflow:hidden;animation:ddoIn .18s var(--ds-ease-in-out)}
@keyframes ddoIn{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
.ddo_head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 14px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.ddo_title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.5}
.ddo_sub{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:1px;font-variant-numeric:tabular-nums}
.ddo_close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.ddo_close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ddo_close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ddo_hero{display:flex;align-items:center;gap:14px;padding:14px;background:radial-gradient(120% 150% at 100% 0%,var(--ddo-tint),transparent 64%),var(--dsw-alias-bg-layer-2)}
.ddo_hero[data-state=off]{--ddo-tint:rgba(56,178,120,.20);--ddo-accent:var(--dsw-alias-state-success-primary)}
.ddo_hero[data-state=peak]{--ddo-tint:rgba(240,166,60,.24);--ddo-accent:var(--dsw-alias-state-warn-primary)}
.ddo_ring{position:relative;flex:none;width:80px;height:80px;display:grid;place-items:center;color:var(--ddo-accent)}
.ddo_ringSvg{position:absolute;inset:0}
.ddo_ringGlyph{position:relative;display:grid;place-items:center;width:100%;height:100%}
.ddo_heroText{min-width:0;flex:1}
.ddo_stateRow{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ddo-accent)}
.ddo_stateDot{width:6px;height:6px;border-radius:50%;background:currentColor}
.ddo_timer{font-size:26px;font-weight:700;line-height:1.3;letter-spacing:.4px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ddo_caption{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ddo_body{display:flex;flex-direction:column;gap:14px;padding:12px 14px 14px;overflow-y:auto}
.ddo_section{display:flex;flex-direction:column;gap:7px}
.ddo_sectionHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary)}
.ddo_sectionHead span{font-weight:400}
.ddo_ruler{direction:ltr;padding:6px 0 0}
.ddo_track{position:relative;height:10px;border-radius:999px;background:var(--dsw-alias-state-success-tertiary)}
.ddo_seg{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--dsw-alias-state-warn-secondary)}
.ddo_seg[data-state=past]{opacity:.45}
.ddo_seg[data-state=now]{background:var(--dsw-alias-state-warn-primary)}
.ddo_now{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;border-radius:2px;background:var(--dsw-alias-label-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-base)}
.ddo_ticks{display:flex;justify-content:space-between;margin-top:6px;font-size:9.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;direction:ltr}
.ddo_windows{display:flex;flex-direction:column;gap:6px}
.ddo_window{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.ddo_window[data-state=now]{border-color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}
.ddo_windowTime{font-size:12.5px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ddo_chip{font-size:10.5px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.ddo_chip[data-state=now]{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-inverted)}
.ddo_chip[data-state=next]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.ddo_note{padding:8px 10px;border-radius:10px;background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.7}
.ddo_alert{display:flex;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}
.ddo_alertIcon{flex:none;color:var(--dsw-alias-state-warn-primary);margin-top:1px}
.ddo_alertTitle{font-size:12.5px;font-weight:600;color:var(--dsw-alias-state-warn-label)}
.ddo_alertBody{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.ddo_times{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.ddo_timeChip{padding:1px 6px;border-radius:6px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ddo_quiet{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.6}
.ddo_quietIcon{flex:none;color:var(--dsw-alias-state-success-primary)}
.ddo_week{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.ddo_rule{font-size:10.5px;line-height:1.9;color:var(--dsw-alias-label-tertiary);border-top:1px dashed var(--dsw-alias-border-l1);padding-top:10px}
.ddo_foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.ddo_sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){.ddo_pill[data-state=peak] .ddo_dot::before{animation:none}.ddo_panel{animation:none}}
`;

    var STYLE_ID = "deepseek-offpeak/widget.css";

    function glyph(paths, extra) {
      return h(
        "svg",
        Object.assign(
          {
            viewBox: "0 0 16 16",
            width: 16,
            height: 16,
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.4,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          extra || {},
        ),
        paths.map(function (path, index) {
          return h("path", Object.assign({ key: index }, path));
        }),
      );
    }

    function CloseIcon() {
      return glyph([{ d: "M4 4l8 8" }, { d: "M12 4l-8 8" }]);
    }

    function MoonIcon(props) {
      return glyph(
        [{ d: "M13.2 9.4A5.6 5.6 0 0 1 6.6 2.8a5.6 5.6 0 1 0 6.6 6.6z" }],
        { width: props.size || 16, height: props.size || 16, fill: "currentColor", fillOpacity: 0.14 },
      );
    }

    function SunIcon(props) {
      return glyph(
        [
          { d: "M8 2v1.6" },
          { d: "M8 12.4V14" },
          { d: "M2 8h1.6" },
          { d: "M12.4 8H14" },
          { d: "M3.8 3.8l1.1 1.1" },
          { d: "M11.1 11.1l1.1 1.1" },
          { d: "M12.2 3.8l-1.1 1.1" },
          { d: "M4.9 11.1l-1.1 1.1" },
          { d: "M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" },
        ],
        { width: props.size || 16, height: props.size || 16 },
      );
    }

    function WarnIcon() {
      return glyph(
        [
          { d: "M8 2.6l5.6 9.8H2.4z" },
          { d: "M8 6.4v3.1" },
          { d: "M8 11.4v.2" },
        ],
        { width: 15, height: 15 },
      );
    }

    function CheckIcon() {
      return glyph(
        [
          { d: "M3 8.4l3.2 3.2" },
          { d: "M13 4.6L6.2 11.6" },
        ],
        { width: 15, height: 15 },
      );
    }

    function Ring(props) {
      var radius = 32;
      var circumference = 2 * Math.PI * radius;
      return h(
        "div",
        { className: "ddo_ring" },
        h(
          "svg",
          { className: "ddo_ringSvg", viewBox: "0 0 80 80", width: 80, height: 80, "aria-hidden": "true" },
          h("circle", {
            cx: 40,
            cy: 40,
            r: radius,
            fill: "none",
            stroke: "var(--dsw-alias-border-l1)",
            strokeWidth: 6,
          }),
          h("circle", {
            cx: 40,
            cy: 40,
            r: radius,
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 6,
            strokeLinecap: "round",
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - props.progress),
            transform: "rotate(-90 40 40)",
          }),
        ),
        h(
          "span",
          { className: "ddo_ringGlyph" },
          props.peak ? h(SunIcon, { size: 22 }) : h(MoonIcon, { size: 22 }),
        ),
      );
    }

    function OffpeakClock() {
      var nowState = React.useState(Date.now());
      var now = nowState[0];
      var setNow = nowState[1];

      var openState = React.useState(false);
      var open = openState[0];
      var setOpen = openState[1];

      var usageState = React.useState({ status: "idle", calls: [] });
      var usage = usageState[0];
      var setUsage = usageState[1];

      var flashState = React.useState(0);
      var flash = flashState[0];
      var setFlash = flashState[1];

      var rootRef = React.useRef(null);
      var pillRef = React.useRef(null);
      var closeRef = React.useRef(null);
      var lastCountRef = React.useRef(null);
      var flashTimerRef = React.useRef(null);
      var wasOpenRef = React.useRef(false);
      var panelId = React.useId();

      React.useEffect(function () {
        var timer = setInterval(function () {
          setNow(Date.now());
        }, 1000);
        return function () {
          clearInterval(timer);
        };
      }, []);

      React.useEffect(
        function () {
          var cancelled = false;

          function load() {
            fetch(USAGE_URL, { cache: "no-store" })
              .then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
              })
              .then(function (payload) {
                if (cancelled) return;
                if (!payload || payload.ok !== true || !Array.isArray(payload.calls)) {
                  throw new Error("malformed usage payload");
                }
                setUsage({ status: "ready", calls: payload.calls });
              })
              .catch(function (error) {
                if (cancelled) return;
                setUsage(function (previous) {
                  return previous.status === "ready"
                    ? previous
                    : { status: "error", calls: [], message: String((error && error.message) || error) };
                });
              });
          }

          load();
          var timer = setInterval(load, POLL_MS);
          function onVisible() {
            if (document.visibilityState === "visible") load();
          }
          document.addEventListener("visibilitychange", onVisible);
          return function () {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
          };
        },
        [],
      );

      React.useEffect(
        function () {
          if (open) {
            if (closeRef.current) closeRef.current.focus();
          } else if (wasOpenRef.current) {
            if (pillRef.current) pillRef.current.focus();
          }
          wasOpenRef.current = open;
        },
        [open],
      );

      React.useEffect(
        function () {
          if (!open) return undefined;
          function onKey(event) {
            if (event.key === "Escape") setOpen(false);
          }
          function onPointer(event) {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
          }
          document.addEventListener("keydown", onKey);
          document.addEventListener("pointerdown", onPointer, true);
          return function () {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerdown", onPointer, true);
          };
        },
        [open],
      );

      React.useEffect(function () {
        return function () {
          if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
        };
      }, []);

      var current = scheduleAt(now);
      var peak = current.peak;
      var remaining = Math.max(0, current.next - now);
      var today = todayWindows(now);
      var summary = summarizePeakUsage(usage.calls, now);
      var todayCount = summary.today.length;

      React.useEffect(
        function () {
          if (usage.status !== "ready") return;
          if (lastCountRef.current === null) {
            lastCountRef.current = todayCount;
            return;
          }
          if (todayCount > lastCountRef.current) {
            lastCountRef.current = todayCount;
            setFlash(Date.now());
            if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
            flashTimerRef.current = setTimeout(function () {
              setFlash(0);
            }, 12000);
          } else {
            lastCountRef.current = todayCount;
          }
        },
        [todayCount, usage.status],
      );

      var flashing = flash !== 0 && Date.now() - flash < 12000;
      var state = peak ? "peak" : "off";
      var weekdayName = WEEKDAY_NAMES[today.weekday] || "";
      var hasUpcomingWindow = today.windows.some(function (slot) {
        return slot.state === "future";
      });
      var showNextWindow = !peak && !hasUpcomingWindow && current.nextOpening !== null;
      var minutesNow = tehranParts(now);
      var markerLeft = ((minutesNow.hour * 60 + minutesNow.minute + minutesNow.second / 60) / 1440) * 100;

      var panel = open
        ? h(
            "section",
            {
              className: "ddo_panel",
              id: panelId,
              role: "dialog",
              dir: "rtl",
              lang: "fa",
              "aria-label": STR.title,
            },
            h(
              "header",
              { className: "ddo_head" },
              h(
                "div",
                null,
                h("div", { className: "ddo_title" }, STR.title),
                h("div", { className: "ddo_sub" }, STR.subtitle),
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "ddo_close",
                  ref: closeRef,
                  "aria-label": STR.close,
                  onClick: function () {
                    setOpen(false);
                  },
                },
                h(CloseIcon),
              ),
            ),
            h(
              "div",
              { className: "ddo_hero", "data-state": state },
              h(Ring, { progress: current.progress, peak: peak }),
              h(
                "div",
                { className: "ddo_heroText" },
                h(
                  "div",
                  { className: "ddo_stateRow", role: "status" },
                  h("span", { className: "ddo_stateDot" }),
                  h("span", null, peak ? STR.statePeak : STR.stateOff),
                ),
                h("div", { className: "ddo_timer" }, formatDuration(remaining)),
                h("div", { className: "ddo_caption" }, peak ? STR.captionPeak : STR.captionOff),
              ),
            ),
            h(
              "div",
              { className: "ddo_body" },
              h(
                "section",
                { className: "ddo_section" },
                h(
                  "div",
                  { className: "ddo_sectionHead" },
                  h("div", null, STR.today),
                  h("span", null, weekdayName),
                ),
                today.peakDay
                  ? h(
                      "div",
                      { className: "ddo_ruler" },
                      h(
                        "div",
                        { className: "ddo_track" },
                        today.windows.map(function (slot, index) {
                          return h("span", {
                            key: index,
                            className: "ddo_seg",
                            "data-state": slot.state,
                            style: {
                              left: (slot.start / 1440) * 100 + "%",
                              width: ((slot.end - slot.start) / 1440) * 100 + "%",
                            },
                          });
                        }),
                        h("span", {
                          className: "ddo_now",
                          style: { left: markerLeft + "%" },
                        }),
                      ),
                      h(
                        "div",
                        { className: "ddo_ticks" },
                        ["۰۰", "۰۶", "۱۲", "۱۸", "۲۴"].map(function (label, index) {
                          return h("span", { key: index }, label);
                        }),
                      ),
                    )
                  : null,
                today.peakDay
                  ? h(
                      "div",
                      { className: "ddo_windows" },
                      today.windows.map(function (slot, index) {
                        var chip =
                          slot.state === "now"
                            ? STR.windowNow
                            : slot.state === "past"
                              ? STR.windowPast
                              : STR.windowNext;
                        return h(
                          "div",
                          { key: index, className: "ddo_window", "data-state": slot.state },
                          h(
                            "span",
                            { className: "ddo_windowTime" },
                            formatClock(slot.start) + " – " + formatClock(slot.end),
                          ),
                          h("span", { className: "ddo_chip", "data-state": slot.state }, chip),
                        );
                      }),
                    )
                  : h("div", { className: "ddo_note" }, STR.todayEmpty),
                showNextWindow
                  ? h(
                      "div",
                      { className: "ddo_week" },
                      STR.nextWindow +
                        ": " +
                        WEEKDAY_NAMES[tehranParts(current.nextOpening).weekday] +
                        " " +
                        formatTime(current.nextOpening),
                    )
                  : null,
              ),
              h(
                "section",
                { className: "ddo_section" },
                h(
                  "div",
                  { className: "ddo_sectionHead" },
                  h("div", null, "مصرف در بازه اوج"),
                  h("span", null, STR.week + ": " + fa(summary.week) + " " + STR.calls),
                ),
                usage.status === "error"
                  ? h("div", { className: "ddo_note" }, STR.usageError)
                  : todayCount > 0 || flashing
                    ? h(
                        "div",
                        { className: "ddo_alert", role: "alert" },
                        h("span", { className: "ddo_alertIcon" }, h(WarnIcon)),
                        h(
                          "div",
                          null,
                          h("div", { className: "ddo_alertTitle" }, STR.alertTitle),
                          h(
                            "div",
                            { className: "ddo_alertBody" },
                            fa(todayCount) + " " + STR.calls + " امروز در ساعت اوج ثبت شده است.",
                          ),
                          h(
                            "div",
                            { className: "ddo_times" },
                            summary.today.slice(-6).map(function (stamp, index) {
                              return h("span", { key: index, className: "ddo_timeChip" }, formatTime(stamp));
                            }),
                            summary.today.length > 6
                              ? h("span", { key: "more", className: "ddo_timeChip" }, "…")
                              : null,
                          ),
                        ),
                      )
                    : h(
                        "div",
                        { className: "ddo_quiet" },
                        h("span", { className: "ddo_quietIcon" }, h(CheckIcon)),
                        h("span", null, STR.quiet),
                      ),
              ),
              h("div", { className: "ddo_rule" }, STR.rule),
              h(
                "div",
                { className: "ddo_foot" },
                h("span", null, STR.source),
                h("span", null, STR.refreshed + " " + formatTime(now)),
              ),
            ),
          )
        : null;

      return h(
        "div",
        { className: "ddo_root", ref: rootRef },
        flashing && !open ? h("div", { className: "ddo_toast", role: "status" }, "⚠ " + STR.toast) : null,
        panel,
        h(
          "button",
          {
            type: "button",
            className: "ddo_pill",
            dir: "rtl",
            lang: "fa",
            ref: pillRef,
            "data-state": state,
            "data-flash": flashing ? "true" : "false",
            title: STR.tooltip,
            "aria-label": STR.open,
            "aria-expanded": open,
            "aria-controls": open ? panelId : undefined,
            onClick: function () {
              setOpen(!open);
            },
          },
          h("span", { className: "ddo_dot" }),
          h("span", { className: "ddo_pillLabel" }, peak ? STR.pillPeak : STR.pillOff),
          h("span", { className: "ddo_pillTimer" }, formatShort(remaining)),
          h("span", { className: "ddo_pillHint" }, peak ? STR.pillHintPeak : STR.pillHintOff),
          todayCount > 0 || flashing
            ? h("span", { className: "ddo_pillAlert" }, "⚠ " + fa(todayCount))
            : null,
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(function () {
        if (typeof document === "undefined") return undefined;
        if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) {
          return undefined;
        }
        var style = document.createElement("style");
        style.dataset.plugin = "deepseek-offpeak";
        style.dataset.pluginCss = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
        return function () {
          style.remove();
        };
      }, "deepseek-offpeak: widget styles");

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register(
          {
            name: "shell.overlay",
            id: "deepseek-offpeak",
            order: 140,
          },
          OffpeakClock,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports._internals = {
      isPeakLocal: isPeakLocal,
      scheduleAt: scheduleAt,
      todayWindows: todayWindows,
      summarizePeakUsage: summarizePeakUsage,
      formatDuration: formatDuration,
      formatShort: formatShort,
      formatClock: formatClock,
    };
    return module.exports;
  },
});
