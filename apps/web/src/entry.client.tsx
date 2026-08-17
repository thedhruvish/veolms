import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const hydrateApplication = () => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
};

// The prerender bootstrap streams the route context through inline scripts at
// the end of the document. An async entry chunk can execute before the parser
// reaches those scripts, making HydratedRouter temporarily render the root
// fallback and discard the correct deep-linked HTML. DOMContentLoaded fires as
// soon as parsing (including those scripts) finishes; it does not wait for
// images or user input, so the app becomes interactive immediately without the
// route flash or delayed click-to-hydrate behavior.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrateApplication, {
    once: true,
  });
} else {
  hydrateApplication();
}
