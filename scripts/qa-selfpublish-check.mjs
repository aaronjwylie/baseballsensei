/* Simulate what the page does inside the real viewer, where the PLATFORM has
   injected its own <style> ahead of ours. The earlier round-trip test built
   from the bare file and so never saw that element — which is exactly how a
   self-publish that discarded the whole stylesheet passed every check. */
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../docs/qa/qa-run.html", import.meta.url), "utf8");

// The viewer serves our body inside its own document, reset stylesheet first.
const framed =
  '<!doctype html><html><head><style>:root{color-scheme:light}body{margin:0}</style>' +
  page.slice(page.indexOf("<style"), page.indexOf("</style>") + 8) +
  "</head><body>" +
  page.slice(page.indexOf('<div id="root">')) +
  "</body></html>";

const firstStyle = framed.slice(framed.indexOf("<style"), framed.indexOf("</style>") + 8);
const ownStyle = framed.match(/<style id="qa-style">([\s\S]*?)<\/style>/);

console.log("  first <style> in the frame is the platform's:", firstStyle.includes("color-scheme:light"));
console.log("  our stylesheet is findable by id:            ", !!ownStyle);
console.log("  our stylesheet length:                       ", ownStyle ? ownStyle[1].length : 0);

if (!ownStyle) { console.error("  FAIL — a self-publish would drop the stylesheet"); process.exit(1); }
if (ownStyle[1].length < 2000) { console.error("  FAIL — stylesheet suspiciously small"); process.exit(1); }
if (!ownStyle[1].includes("--brand")) { console.error("  FAIL — tokens missing"); process.exit(1); }

// And the republished document must carry the id forward, or the NEXT
// self-publish hits the same wall.
const app = page.slice(page.indexOf('<script id="app">'), page.lastIndexOf("</script>"));
if (!app.includes('<style id="qa-style">')) {
  console.error("  FAIL — renderDocument emits <style> without the id; publish once and it breaks");
  process.exit(1);
}
console.log("  republished document keeps the id:            yes");
console.log("  PASS");
