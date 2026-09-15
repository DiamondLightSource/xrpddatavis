xrddatavis frontend
====================

The web UI at `/`, built with React, TypeScript, [MUI](https://mui.com), and
[SciReactUI](https://diamondlightsource.github.io/sci-react-ui/) (Diamond's
design system - `ThemeProvider`, `Navbar`/`ColourSchemeButton` for the app
shell, theme roles and tokens for everything else). Conventions this app
follows, from the design system's own docs:

* [Overview](https://diamondlightsource.github.io/sci-react-ui/?path=/docs/overview--docs) -
  use existing components/patterns before inventing new ones; semantic theme
  roles and tokens over hardcoded values.
* [Working with Components](https://diamondlightsource.github.io/sci-react-ui/?path=/docs/working-with-components--docs) -
  standard MUI props (`variant`/`color`/`size`/`disabled`) over one-off CSS.
* [Practical Guidance](https://diamondlightsource.github.io/sci-react-ui/?path=/docs/practical-guidance--docs) -
  colour usage, surfaces/elevation, borders, button hierarchy and pairing,
  feedback/error guidance.
* Foundations → [Typography](https://diamondlightsource.github.io/sci-react-ui/?path=/docs/foundations-typography--docs) -
  `mono1`/`mono2`/`mono3` for technical values (IDs, timestamps, numeric
  columns, file paths - see `PlotTable.tsx`, `Facets.tsx`, `UploadDialog.tsx`),
  `meta` for operational status text (see the sidebar footer and
  `StatusChips.tsx`), `overline` for grouping labels (`Facets.tsx`).
* Foundations → [Icons](https://diamondlightsource.github.io/sci-react-ui/?path=/docs/foundations-icons--docs) -
  Lucide is the DS's primary icon family for new work; every icon this app
  chooses itself is `lucide-react`, sized per the DS's five-size table
  (`iconSizes.ts`). The one exception is `ColourSchemeButton`'s sun/moon
  icons, which are internal to that library component (still Material Icons
  in `0.7.0`) and outside this app's control.
* Theme → [Logos](https://diamondlightsource.github.io/sci-react-ui/?path=/docs/theme-logos--docs) -
  see the note on `theme.logos` below.

Vite builds straight into [`../src/xrddatavis/static`](../src/xrddatavis/server.py) -
the FastAPI server serves that directory unchanged, so there is nothing else
to wire up after a build.

**The build output is never committed** - `src/xrddatavis/static/*` is
gitignored, the same way compiled bytecode or a Python sdist's `build/`
directory would be. `xrddatavis serve` needs it built first (it raises a
clear error, rather than an obscure 500, if it's missing); the Dockerfile
builds it during the image build; CI (`_test.yml`, `_dist.yml`) builds it
before running tests or packaging a wheel. This keeps the ~900KB minified
bundle (React, MUI, emotion and the app itself) and the ~150KB of
self-hosted font files out of git history, where every frontend change
would otherwise rewrite them in full, growing the repo forever.

## Develop

```sh
npm install
npm run dev       # http://localhost:5173, proxies API calls to :8000
```

Run the real server alongside it so the dev proxy (`vite.config.ts`) has
something to talk to - build the frontend once first, so it exists to serve:

```sh
npm run build      # writes ../src/xrddatavis/static, once
xrddatavis serve   # in the repo root, in another terminal
```

## Build

```sh
npm run build      # writes ../src/xrddatavis/static
```

Needed before `xrddatavis serve` will start locally (see above) or before
building a Python sdist/wheel by hand; CI and the Dockerfile both do this
automatically as part of testing/packaging/the image build, so this is only
something you run yourself for local dev.

## Notable choices

* **Plotly is loaded from cdnjs as a global** (see `index.html`), not bundled
  - it is ~1MB and doesn't need to be part of the app's own bundle.
  `PlotlyChart.tsx` talks to `window.Plotly`; `@types/plotly.js` is a dev
  dependency for typing only.
* **Fonts**: SciReactUI's own `font-styles.css` convenience export
  (Inter/Outfit/IBM Plex Mono, per the Typography usage guidance) exists on
  its `main` branch but hadn't been published to npm as of `0.7.0`, the
  latest release at time of writing - see `main.tsx` for the direct
  `@fontsource*` imports used instead. Swap back to the single import once a
  later release ships it.
* **Diamond logo**: same gap, one level up - `DiamondDSTheme`'s `theme.logos`
  (what the library's own `<Logo />`, and `Navbar`'s `logo="theme"` shorthand,
  read) isn't wired to the actual Diamond SVGs in `0.7.0` either, so `App.tsx`
  renders them via `ImageColourSchemeSwitch` directly (the primitive both are
  built on, which *is* in `0.7.0`), with the same light/dark SVGs copied from
  the library's `main` branch into `src/assets/`. It's composed by hand in
  `leftSlot` alongside the project name and beamline, each pair separated by
  a `Divider` - rather than via `Navbar`'s own `logo` prop, which places the
  logo with a fixed margin and no divider between it and what follows.
  Revisit both choices once a release past `0.7.0` ships `theme.logos`.
* **`Navbar` with `containerWidth={false}`**: `Bar` (which `Navbar` and
  `AppTitlebar` both build on) centers its slots inside a `maxWidth="lg"`
  `Container` by default - fine for a marketing-style page, but it made the
  logo/title look off-centre and not flush with the sidebar/chart below,
  since those already span the full viewport. `containerWidth={false}` (an
  explicitly documented `Bar` prop) removes that constraint so the header
  lines up with the rest of a full-width app.
* **No data table library**: the plot list is a plain MUI `Table` - fine at
  the scale of `plots.max_plots` (tens of rows), and keeps one fewer
  dependency to theme.
* **Upload header detection** (`uploadParser.ts`): real instrument files -
  PDFgetX2's `.gr`/`.sq`/`.fq`/`.iq`, SPEC-derived formats - don't have a
  fixed-length header. A `.gr` file's preamble is 100+ lines of `key=value`
  settings and `#`-prefixed metadata ending in a `##### start data` marker,
  and the real column count can be more than the classic x/y/e (PDFgetX2's
  is x, y, dx, dy). Rather than assume a header length or column count, the
  parser scans for the first run of consistent, purely-numeric rows -
  wherever it falls - and reads a SPEC-style `#L name1 name2 ...` line (or a
  plain header row immediately above the data) for column names when one is
  there. Column mapping (which column is X/Y/E) defaults from that but is
  always user-adjustable, since a file's error column isn't always last and
  can't always be guessed. When no confident run is found - a genuinely
  irregular file - the dialog asks for the header line count directly, which
  is then trusted outright rather than re-validated.
* **Instrument-session picker is title-bar scope, not a sidebar facet**: it's
  positioned with the logo/name/beamline (`useInstrumentSessionFilter.ts`,
  `SessionSelect.tsx`) rather than alongside the Type/File # facets in
  `Facets.tsx`, per how it was asked for - it reads as choosing *which
  experiment's data you're looking at*, upstream of how you're viewing it,
  rather than another way of slicing one view. It still composes the same
  way as those facets do: `App.tsx` narrows `plots` through it before
  `useFacets`, so Type/File # (and their counts) automatically scope to the
  selected session. `SessionSelect` intentionally isn't wrapped in a
  `Tooltip` - MUI's shows on focus as well as hover, which left it open
  (overlapping the sidebar below) after picking an option, since focus
  stays on the select afterwards.
