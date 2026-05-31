/**
 * /feedback — full-page Tally embed for users who want to share
 * detailed feedback without the popup. Linked from:
 *   - the beta banner (every product page)
 *   - the results card on /analyse
 *   - the footer (Platform column)
 *
 * The Tally script is already injected at the root layout
 * (next/script lazyOnload), so this page only needs to (a) provide
 * the iframe target with `data-tally-src`, and (b) wait for the
 * script to hydrate and swap in the real src. The bootstrap snippet
 * below handles both cases — script already loaded, or still loading.
 */

import Script from "next/script"

export const metadata = {
  title: "Beta Feedback — Metalyzi",
  description:
    "Share your feedback on the Metalyzi beta. Your input shapes what we build next.",
}

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-foreground">
          Beta Feedback
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Your feedback shapes what we build next. Takes 3 minutes.
        </p>

        <div className="overflow-hidden rounded-lg border border-border/40 bg-card">
          <iframe
            data-tally-src="https://tally.so/embed/0QabP0?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
            loading="lazy"
            width="100%"
            height="500"
            title="Metalyzi Beta Feedback"
            className="block w-full border-0"
          />
        </div>
      </div>

      {/* Tally embed bootstrap — handles both "script already loaded
          via layout" and "page opened before script booted" cases.
          afterInteractive so it runs after the iframe is in the DOM
          but doesn't block first paint. */}
      <Script id="tally-embed-bootstrap" strategy="afterInteractive">
        {`
          (function () {
            var d = document, w = "https://tally.so/widgets/embed.js";
            var v = function () {
              if (typeof Tally !== "undefined") {
                Tally.loadEmbeds();
              } else {
                d.querySelectorAll("iframe[data-tally-src]:not([src])").forEach(function (e) {
                  e.src = e.dataset.tallySrc;
                });
              }
            };
            if (typeof Tally !== "undefined") {
              v();
            } else if (d.querySelector('script[src="' + w + '"]') == null) {
              var s = d.createElement("script");
              s.src = w; s.onload = v; s.onerror = v; d.body.appendChild(s);
            } else {
              // Layout script is in-flight — retry on next tick.
              setTimeout(v, 500);
            }
          })();
        `}
      </Script>
    </div>
  )
}
