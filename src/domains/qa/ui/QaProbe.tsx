"use client";

import { useEffect, useRef } from "react";
import {
  MAX_BATCH,
  QA_FLAG_COOKIE,
  isSensitiveField,
  type QaEventInput,
  type QaEventKind,
} from "../model/qaEvent";

/**
 * Watches a QA run and ships what it sees.
 *
 * **It records descriptions, never contents.** A click sends the element's
 * accessible name; a form interaction sends the field's *name*; an error sends
 * its message. Nothing sends what anybody typed, and any field whose name looks
 * sensitive is dropped twice — here, and again in the route — because during a
 * QA pass this component is one of the things under test.
 *
 * **It must never become the bug.** Every listener is wrapped, the sender
 * swallows its own failures, and nothing here throws into the page. An
 * instrument that breaks the thing it is measuring is worse than no instrument.
 *
 * Batched on a timer rather than sent per event, so a click-heavy minute is a
 * handful of requests instead of hundreds.
 */
/**
 * A short name for this browser, sent once per session with `run started`.
 *
 * A pass run across nine browsers produces nine sessions of anonymous ids, and
 * "the ticker does not scroll" is a different finding depending on which one it
 * came from. The log could not answer that question, so every cross-browser
 * finding needed a human to remember which tab was which.
 *
 * **A label, not the user-agent string.** The full UA is a fingerprint and is
 * unreadable in a log line; this is the two facts a QA run actually uses. It is
 * only ever sent by an armed session, which means a tester who has passed the
 * site's own gate — never a customer.
 *
 * Order matters: Edge, Opera and Brave all carry "Chrome" in their UA, so the
 * derivatives are tested before the thing they derive from.
 */
function browserLabel(): string {
  const ua = navigator.userAgent;
  const brave = "brave" in navigator;
  const name = /OPR\//.test(ua)
    ? "Opera"
    : /Edg\//.test(ua)
      ? "Edge"
      : brave
        ? "Brave"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /CriOS\//.test(ua)
            ? "Chrome iOS"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : "unknown";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "?";
  return `${name} · ${os}`;
}

export function QaProbe() {
  const queue = useRef<QaEventInput[]>([]);
  const seq = useRef(0);
  const session = useRef("");

  useEffect(() => {
    /*
      Self-gating, and this is the whole of the on/off switch in the browser.

      Reading the cookie server-side would have been tidier, but doing it in the
      root layout makes every route in the app dynamic — see the note in
      `app/layout.tsx`. So the component ships to everyone and returns here for
      everyone who has not armed a run. Nothing below this line runs otherwise:
      no listeners, no timers, no requests.
    */
    const armed = document.cookie
      .split(";")
      .some((c) => c.trim() === `${QA_FLAG_COOKIE}=1`);
    if (!armed) return;

    // One id per browser session, so two passes don't interleave in the log.
    session.current =
      sessionStorage.getItem("qa_session") ??
      `${new Date().toISOString().slice(0, 19)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      sessionStorage.setItem("qa_session", session.current);
    } catch {
      /* private mode — the id still works for this page's lifetime */
    }

    const push = (
      kind: QaEventKind,
      fields: { target?: string; field?: string; detail?: string } = {},
    ) => {
      if (fields.field && isSensitiveField(fields.field)) return;
      queue.current.push({
        session: session.current,
        seq: seq.current++,
        kind,
        path: location.pathname + location.search,
        ...fields,
      });
      if (queue.current.length >= MAX_BATCH) void flush();
    };

    async function flush() {
      const batch = queue.current.splice(0, MAX_BATCH);
      if (batch.length === 0) return;
      try {
        await fetch("/api/qa/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
          keepalive: true,
        });
      } catch {
        /* offline or blocked — drop it; the run matters more than the log */
      }
    }

    /** A short, human description of what was clicked. */
    const describe = (el: Element): string => {
      const node = el.closest(
        "button,a,[role=button],summary,input,select,textarea,label",
      );
      /*
        A click that lands on nothing interactive still says something — the
        first run recorded two bare `div`s on /start, which could equally have
        been a mis-aimed click at a control or a tap on empty space, and the
        log could not tell the difference. Carrying a little of the text under
        the cursor makes that answerable.
      */
      if (!node) {
        const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim().slice(0, 50);
        return `${el.tagName.toLowerCase()}${text ? ` (near "${text}")` : " (no target)"}`;
      }
      const tag = node.tagName.toLowerCase();
      /*
        A `<select>`'s innerText is every option it contains, so reading it
        produced `select "Not sure / general Hitting Pitching Fielding…"` — the
        whole menu, for a click that chose none of it. The field's name is what
        identifies it; which option was chosen arrives separately as a `field`
        event.
      */
      const text = (node.getAttribute("aria-label") ||
        (tag === "select" ? node.getAttribute("name") : (node as HTMLElement).innerText) ||
        node.getAttribute("title") ||
        node.getAttribute("name") ||
        "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      const href = node.getAttribute("href");
      return `${tag}${text ? ` "${text}"` : ""}${href ? ` → ${href}` : ""}`;
    };

    const onClick = (e: MouseEvent) => {
      try {
        const el = e.target as Element | null;
        if (el) push("click", { target: describe(el) });
      } catch {
        /* never interfere with the click itself */
      }
    };

    const onSubmit = (e: Event) => {
      try {
        const form = e.target as HTMLFormElement;
        const names = Array.from(form.elements)
          .map((el) => (el as HTMLInputElement).name)
          .filter((n) => n && !isSensitiveField(n));
        push("submit", {
          target: form.getAttribute("aria-label") || form.id || "form",
          detail: JSON.stringify({ fields: names }),
        });
      } catch {
        /* ignore */
      }
    };

    /** Which field was touched, and how long the entry was — never the entry. */
    const onChange = (e: Event) => {
      try {
        const el = e.target as HTMLInputElement;
        if (!el?.name || el.type === "password") return;
        if (isSensitiveField(el.name)) return;
        push("field", {
          field: el.name,
          detail: JSON.stringify({
            type: el.type,
            length: (el.value ?? "").length,
            filled: (el.value ?? "").length > 0,
          }),
        });
      } catch {
        /* ignore */
      }
    };

    const onError = (e: ErrorEvent) =>
      push("error", { target: e.message?.slice(0, 300), detail: e.filename });

    const onRejection = (e: PromiseRejectionEvent) =>
      push("error", { target: `unhandled rejection: ${String(e.reason).slice(0, 300)}` });

    /*
      Route changes: the App Router navigates without a load event.

      **The hash is part of the location here**, and was not at first. This site
      navigates mostly by anchor — the whole landing nav is `/#pricing`,
      `/#faq` — so comparing only `pathname + search` recorded the click and
      then nothing, and a run of four anchor clicks looked identical whether
      the page had scrolled or not. That is precisely the thing worth checking
      on a page built out of anchors.

      `path` on each event stays pathname+search so one page reads as one page;
      the hash rides on the nav event's target, where the movement is the point.
    */
    const here = () => location.pathname + location.search + location.hash;
    let lastPath = here();
    const watchPath = () => {
      const now = here();
      if (now !== lastPath) {
        lastPath = now;
        push("nav", { target: now });
      }
    };
    // Fires immediately on an anchor click, rather than waiting for the poll.
    window.addEventListener("hashchange", watchPath);

    /*
      Failed requests.

      The first run showed no errors at all, which is reassuring but also
      incomplete: a server action returning 500, an upload rejected by Blob, or
      a dropped connection produce no window error and often no console output
      either. During a QA pass those are exactly the failures worth seeing, and
      "it just didn't work" is what a tester would otherwise have to report.

      Only the path is recorded — never the query string, which is where tokens
      travel. The QA endpoints are skipped, or reporting a failure would post a
      request whose failure would be reported.
    */
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      let url = "";
      try {
        const raw = args[0];
        url = typeof raw === "string" ? raw : raw instanceof URL ? raw.href : raw.url;
      } catch {
        /* exotic input — let it through unrecorded */
      }
      /*
        Two kinds of request are deliberately not reported.

        `/api/qa/` — reporting its failure would post a request whose failure
        would be reported.

        `_rsc` — Next's React Server Component prefetch. The router fires these
        speculatively for links it thinks you may follow, and **abandons them
        the moment you navigate**, which is constant and correct. The first run
        with fetch capture on recorded four "network failures" in one second,
        all of them prefetches cancelled by the click that made them moot. A log
        that cries wolf four times a minute is a log nobody reads by phase three.
      */
      const isQa = url.includes("/api/qa/") || url.includes("_rsc=");
      try {
        const res = await originalFetch(...args);
        if (!isQa && !res.ok) {
          let path = url;
          try {
            path = new URL(url, location.origin).pathname;
          } catch {
            /* keep the raw value */
          }
          push("fetch", { target: `${res.status} ${path}` });
        }
        return res;
      } catch (err) {
        /*
          An abort is not a failure. Navigating away, a component unmounting
          mid-request, or an explicit AbortController all land here, and none
          of them is something a tester should be shown.
        */
        const aborted =
          (err as { name?: string })?.name === "AbortError" ||
          (args[1] as RequestInit | undefined)?.signal?.aborted;
        if (!isQa && !aborted) {
          push("fetch", { target: `network failure ${url.slice(0, 120)}` });
        }
        throw err;
      }
    };

    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      try {
        push("console", { target: args.map(String).join(" ").slice(0, 300) });
      } catch {
        /* ignore */
      }
      originalError(...args);
    };

    /*
      Rendered errors, which are the ones that matter here.

      This app reports failure by putting a message on the screen: a server
      action answers `{ ok: false, error }` over **HTTP 200**, and the flow
      renders it into a `role="alert"`. Nothing about that is a window error, a
      console line, or a failed request — so the first real run showed a
      customer submitting a verification code and then, as far as the log was
      concerned, simply stopping. The most common failure mode in the whole
      product was the one thing the instrument could not see.

      An observer watches for alerts appearing anywhere and records their text.
      Text, not values: an alert says what went wrong, and what went wrong is
      exactly what a QA log is for.
    */
    const seenAlerts = new WeakSet<Element>();
    const reportAlert = (el: Element) => {
      if (seenAlerts.has(el)) return;
      seenAlerts.add(el);
      const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
      if (text) push("error", { target: `shown: ${text.slice(0, 200)}` });
    };

    const scanForAlerts = (root: ParentNode) => {
      try {
        if (root instanceof Element && root.getAttribute?.("role") === "alert") {
          reportAlert(root);
        }
        root.querySelectorAll?.('[role="alert"]').forEach(reportAlert);
      } catch {
        /* never interfere with rendering */
      }
    };

    const alertObserver = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((n) => {
          if (n.nodeType === 1) scanForAlerts(n as Element);
        });
      }
    });
    alertObserver.observe(document.body, { childList: true, subtree: true });
    scanForAlerts(document);

    push("nav", { target: lastPath, detail: `run started · ${browserLabel()}` });

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("change", onChange, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const pathTimer = setInterval(watchPath, 400);
    const flushTimer = setInterval(() => void flush(), 2000);
    const onHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("hashchange", watchPath);
      document.removeEventListener("visibilitychange", onHide);
      alertObserver.disconnect();
      clearInterval(pathTimer);
      clearInterval(flushTimer);
      console.error = originalError;
      window.fetch = originalFetch;
      void flush();
    };
  }, []);

  return null;
}
