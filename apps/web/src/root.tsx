import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import { fullAppStylesheet } from "./appStylesheet";
import manropeFontUrl from "./assets/fonts/manrope-core.woff2?url";
import procodrrLogoMark from "./assets/procodrr-logo-mark.svg";
import { ReadingModeEffects } from "./reading-mode/ReadingModeEffects";
import { getReadingModeBootstrapScript } from "./reading-mode/readingModePreferences";
import { getSurfaceDepthBootstrapScript } from "./settings/settingsPreferences";
import {
  ACADEMY_THEME_VERSION,
  DEFAULT_ACADEMY_THEME,
  academyThemes,
} from "./themes";

interface LayoutProps {
  children: ReactNode;
}

const academyThemeIds = JSON.stringify(academyThemes.map(({ id }) => id));

const getAppearanceBootstrapScript = () =>
  `(()=>{const r=document.documentElement,p=${academyThemeIds};try{const t=localStorage.getItem("veolms-theme")||"dark";r.dataset.theme=t==="device"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="light"?"light":"dark"}catch{}try{const e=localStorage.getItem("veolms-randomize-academy-theme")==="true",s=sessionStorage.getItem("veolms-session-academy-theme"),l=localStorage.getItem("veolms-academy-theme"),c=localStorage.getItem("veolms-academy-theme-version")===${JSON.stringify(ACADEMY_THEME_VERSION)},v=e&&p.includes(s||"")?s:c&&p.includes(l||"")?l:${JSON.stringify(DEFAULT_ACADEMY_THEME)};r.dataset.palette=v}catch{}})();`;

const getHydrationCriticalCss = () =>
  typeof document === "undefined"
    ? ""
    : (document.querySelector("style[data-critical-css]")?.textContent ?? "");

const getSidebarLayoutBootstrapScript = () =>
  `(()=>{try{const app=document.querySelector(".courses-app");if(!app)return;const saved=localStorage.getItem("veolms-sidebar-mode"),legacy=localStorage.getItem("veolms-sidebar-collapsed")==="true",mode=saved==="collapsed"||saved==="hidden"||saved==="expanded"?saved:legacy?"collapsed":"expanded",raw=Number(localStorage.getItem("veolms-sidebar-width")),width=Number.isFinite(raw)&&raw>=220?Math.min(520,raw):300;app.style.setProperty("--sidebar-expanded-width",width+"px");app.style.setProperty("--sidebar-resize-preview-width","76px");if(mode==="collapsed")app.classList.add("courses-app--collapsed");if(mode==="hidden")app.classList.add("courses-app--hidden")}catch{}})();`;

export function Layout({ children }: LayoutProps) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-palette="codex"
      data-reading-mode="false"
      data-reading-mode-texture="false"
      data-reading-mode-temperature="false"
      data-reading-mode-colors="full"
      data-page-tab-colors="follow-sidebar"
      data-elevated-surfaces="true"
      data-sidebar-menu-elevation="false"
      suppressHydrationWarning
    >
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="theme-color" content="#151718" />
        <link rel="icon" type="image/svg+xml" href={procodrrLogoMark} />
        <link
          rel="preload"
          href={manropeFontUrl}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{ __html: getAppearanceBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getReadingModeBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getSurfaceDepthBootstrapScript() }}
        />
        <style
          data-critical-css
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: getHydrationCriticalCss() }}
        />
        <link rel="stylesheet" href={fullAppStylesheet} />
        <Meta />
        <Links />
      </head>
      <body>
        <div id="root">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html: getSidebarLayoutBootstrapScript(),
          }}
        />
        <Scripts />
        <ReadingModeEffects />
      </body>
    </html>
  );
}

export const meta = () => [
  { title: "ProCodrr \u00B7 Learn, build, and keep moving" },
  {
    name: "description",
    content:
      "Continue your courses, track learning progress, and explore practical developer education in ProCodrr.",
  },
];

export default function Root() {
  return <Outlet />;
}
