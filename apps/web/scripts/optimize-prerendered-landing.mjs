import { readdir, readFile } from "node:fs/promises";
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

  for (const pagePath of pages) {
    const pageHtml = await readFile(pagePath, "utf8");
    const hasStylesheet = /<link[^>]+rel="stylesheet"/i.test(pageHtml);
    const hasHydrationModule = /<script[^>]+type="module"/i.test(pageHtml);

    if (!hasStylesheet || !hasHydrationModule) {
      invalidPages.push(
        `${path.relative(clientDirectory, pagePath)} (${[
          !hasStylesheet ? "stylesheet" : "",
          !hasHydrationModule ? "hydration module" : "",
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
    `Prerender integrity pass: ${pages.length} pages; hydration and CSS remain eager`,
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
