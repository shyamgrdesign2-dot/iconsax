# Iconsax Icons

Iconsax Pro icon set packaged as React components plus raw SVGs.

Six styles per icon: `bold`, `broken`, `bulk`, `linear`, `outline`, `twotone`.

> The Iconsax MCP API exposes these six styles only — there is no separate
> "rounded vs straight" axis on the API. Each icon is available in all six
> stroke/fill treatments above.

## Install

This package is hosted directly on GitHub, so install it via the GitHub URL:

```bash
npm install github:shyamgrdesign2-dot/iconsax
# or pin a tag / branch:
npm install github:shyamgrdesign2-dot/iconsax#v0.1.0
```

## Usage

```tsx
// Subpath import — bundles only the style you use.
import { AiHome, ArrowRight2 } from "@iconsax/icons/linear";

export const Header = () => (
  <header>
    <AiHome width={32} height={32} stroke="currentColor" />
    <ArrowRight2 />
  </header>
);
```

```tsx
// Or grab the namespace from the root export.
import { Bold, Outline } from "@iconsax/icons";

<Bold.AiHome />
<Outline.AiHome />
```

```tsx
// All standard SVG props are forwarded.
<AiHome width={48} height={48} color="#7c3aed" className="my-icon" />
```

### Raw SVGs

Every SVG is also shipped on disk under `svg/<style>/<name>.svg`, so you can
import them directly with your bundler's SVG loader or copy them out:

```ts
import linearHomeUrl from "@iconsax/icons/svg/linear/ai-home.svg";
```

## What's in the box

- `dist/` — compiled React components (ESM + CJS + `.d.ts`).
- `src/` — TypeScript source (one component per icon, per style).
- `svg/` — raw SVG files, organised by style.
- `icons.json` — manifest of every icon name and the styles it is available in.

## How this was built (and how to regenerate)

The icons are sourced from the [Iconsax](https://iconsax.io) MCP server. To
re-crawl from scratch (e.g. when Iconsax adds new icons):

```bash
cp .env.example .env   # fill in ICONSAX_TOKEN
npm install
npm run crawl:discover   # enumerate every icon name
npm run crawl:fetch      # fetch SVGs (6 styles per name)
npm run generate         # produce React components in src/
npm run build            # compile dist/ (ESM + CJS + types)
```

The crawler is resumable — it persists progress in `crawl-state/` and skips
already-downloaded SVGs on re-runs.

## License

The icons themselves are licensed by Iconsax under the terms of your Iconsax
subscription. This packaging code is provided as-is for use within projects
that hold a valid Iconsax license.
