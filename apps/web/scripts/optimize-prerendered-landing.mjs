import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";

const collectPrerenderedPages = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      pages.push(...(await collectPrerenderedPages(entryPath)));
    } else if (entry.name === "index.html") {
      pages.push(entryPath);
    }
  }

  return pages;
};

const criticalSelectorHints = [
  "courses-app",
  "courses-sidebar",
  "courses-main",
  "courses-nav",
  "courses-profile",
  "student-surface-main",
  "mobile-bottom-nav",
  "@font-face",
];

/**
 * Pull only the global and application-shell rules out of the generated CSS.
 * The full stylesheet remains linked for interaction/page-specific styles, but
 * this small generated subset lets the prerender paint with the same geometry
 * before that stylesheet has finished downloading.
 */
const isCriticalSelector = (selector) =>
  selector.split(",").some((part) => {
    const normalizedSelector = part.trim();
    return (
      normalizedSelector.startsWith(":root") ||
      normalizedSelector === "*" ||
      normalizedSelector === "html" ||
      normalizedSelector === "body" ||
      criticalSelectorHints.some((hint) => normalizedSelector.includes(hint))
    );
  });

/**
 * Retain shell rules wherever they occur in the stylesheet. PostCSS lets us
 * clone only matching descendants while rebuilding their ancestor at-rules,
 * so responsive `@media`/`@supports` geometry is preserved without pulling
 * unrelated page styles into every prerendered document.
 */
const extractCriticalCss = (css) => {
  const root = postcss.parse(css);

  const selectCriticalNodes = (container) => {
    const nodes = [];

    container.each((node) => {
      if (node.type === "rule") {
        if (isCriticalSelector(node.selector)) nodes.push(node.clone());
        return;
      }

      if (node.type === "atrule" && node.name.toLowerCase() === "font-face") {
        nodes.push(node.clone());
        return;
      }

      if (!node.nodes) return;
      const criticalChildren = selectCriticalNodes(node);
      if (criticalChildren.length === 0) return;

      nodes.push(node.clone({ nodes: criticalChildren }));
    });

    return nodes;
  };

  return postcss.root({ nodes: selectCriticalNodes(root) }).toString();
};

const getStylesheetHref = (html) =>
  html
    .match(/<link[^>]+rel=["']stylesheet["'][^>]*>/i)?.[0]
    ?.match(/href=["']([^"']+)["']/i)?.[1];

const criticalCssCache = new Map();

const injectCriticalCss = async ({ clientDirectory, pagePath, pageHtml }) => {
  const stylesheetHref = getStylesheetHref(pageHtml);
  if (!stylesheetHref || !pageHtml.includes('data-critical-css="true"')) {
    return { html: pageHtml, injected: false };
  }

  const stylesheetPath = path.resolve(
    clientDirectory,
    stylesheetHref.replace(/^\//, ""),
  );
  let criticalCss = criticalCssCache.get(stylesheetPath);
  if (!criticalCss) {
    const stylesheet = await readFile(stylesheetPath, "utf8");
    criticalCss = extractCriticalCss(stylesheet);
    criticalCssCache.set(stylesheetPath, criticalCss);
  }
  if (!criticalCss) {
    throw new Error(
      `Unable to extract critical shell CSS for ${path.relative(clientDirectory, pagePath)}`,
    );
  }

  const updatedHtml = pageHtml.replace(
    /(<style[^>]+data-critical-css(?:="true")?[^>]*>)[\s\S]*?(<\/style>)/i,
    `$1${criticalCss}$2`,
  );
  await writeFile(pagePath, updatedHtml);
  return { html: updatedHtml, injected: true };
};

/**
 * Verify that each prerendered document keeps its normal stylesheet,
 * modulepreloads, and executable hydration script intact. React owns its
 * streamed document markers and reveal timing; rewriting that inline runtime
 * can make the server DOM differ from the tree the client hydrates.
 */
export async function optimizePrerenderedLanding({
  projectRoot,
  buildDirectory,
}) {
  const clientDirectory = path.resolve(projectRoot, buildDirectory, "client");
  const pages = await collectPrerenderedPages(clientDirectory);
  const invalidPages = [];

  let injectedPageCount = 0;

  for (const pagePath of pages) {
    const pageHtml = await readFile(pagePath, "utf8");
    const optimizedPage = await injectCriticalCss({
      clientDirectory,
      pagePath,
      pageHtml,
    });
    if (optimizedPage.injected) injectedPageCount += 1;

    const hasStylesheet = /<link[^>]+rel="stylesheet"/i.test(pageHtml);
    const hasHydrationModule = /<script[^>]+type="module"/i.test(pageHtml);
    const hasCriticalCss =
      /<style[^>]+data-critical-css[^>]*>[\s\S]*?\S[\s\S]*?<\/style>/i.test(
        optimizedPage.html,
      );

    if (!hasStylesheet || !hasHydrationModule || !hasCriticalCss) {
      invalidPages.push(
        `${path.relative(clientDirectory, pagePath)} (${[
          !hasStylesheet ? "stylesheet" : "",
          !hasHydrationModule ? "hydration module" : "",
          !hasCriticalCss ? "critical CSS" : "",
        ]
          .filter(Boolean)
          .join(", ")} missing)`,
      );
    }
  }

  if (invalidPages.length > 0) {
    throw new Error(
      `Prerendered pages are not immediately usable:\n${invalidPages.join("\n")}`,
    );
  }

  console.log(
    `Prerender integrity pass: ${pages.length} pages; injected critical CSS into ${injectedPageCount} documents`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  await optimizePrerenderedLanding({
    projectRoot: process.cwd(),
    buildDirectory: "build",
  });
}
