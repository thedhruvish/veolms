import logoDarkSvg from "../assets/procodrr-logo-dark.svg?raw";

const brandWordmarkSvg = logoDarkSvg.replace(
  /fill="black"/g,
  'fill="currentColor"',
);

export function AuthBrandMark() {
  return (
    <span
      aria-hidden="true"
      className="auth-card__brand"
      dangerouslySetInnerHTML={{ __html: brandWordmarkSvg }}
    />
  );
}

export function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      {/* Reserves space for the illustration, which lands in a later batch. */}
      <div aria-hidden="true" className="auth-brand-panel__illustration-slot" />
    </div>
  );
}
