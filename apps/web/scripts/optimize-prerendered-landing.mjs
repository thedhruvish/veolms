import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
const extractCriticalCss = (css) => {
  const blocks = [];
  let depth = 0;
  let blockStart = 0;

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      if (depth === 0) blockStart = css.lastIndexOf("}", index - 1) + 1;
      depth += 1;
      continue;
    }
    if (character !== "}") continue;

    depth -= 1;
    if (depth !== 0) continue;

    const block = css.slice(blockStart, index + 1);
    const header = block.slice(0, block.indexOf("{")).trim();
    if (
      header.startsWith(":root") ||
      header === "*" ||
      header === "html" ||
      header === "body" ||
      criticalSelectorHints.some((hint) => header.includes(hint))
    ) {
      blocks.push(block);
    }
  }

  return blocks.join("");
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
      /<style[^>]+data-critical-css[^>]*>[^<]+<\/style>/i.test(
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
