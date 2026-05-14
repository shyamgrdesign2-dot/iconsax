# Iconsax Icons

A unified icon library packaged as React components plus raw SVGs.

Three sources, each in its own namespace:

| Source | Names | Styles | Notes |
|--------|------:|--------|-------|
| `free` | 1,207 | 6 (bold · broken · bulk · linear · outline · twotone) | Iconsax free set |
| `pro`  | 5,468 | 6 (bold · broken · bulk · linear · outline · twotone) | Iconsax Pro set (requires an Iconsax Pro license to crawl) |
| `tp`   | 72    | 3 (bulk · line · solid) | Custom TP Medical icons |

> 25,164 React components / raw SVGs total. Many icons (especially in `pro`)
> only ship with a subset of styles — see `icons-pro.json` / `icons-free.json`
> / `icons-tp.json` for per-icon style availability.

## Install

```bash
npm install github:shyamgrdesign2-dot/iconsax
# or pin a tag (recommended):
npm install github:shyamgrdesign2-dot/iconsax#v0.2.0
```

## Usage

```tsx
// Subpath imports — your bundler tree-shakes unused icons.
import { AiHome }    from "@iconsax/icons/pro/linear";
import { Home }      from "@iconsax/icons/free/bold";
import { Ambulance } from "@iconsax/icons/tp/line";

export const Header = () => (
  <header>
    <AiHome    width={32} height={32} />
    <Home      width={32} height={32} />
    <Ambulance width={32} height={32} color="#7c3aed" />
  </header>
);
```

```tsx
// Or use namespaced imports.
import { Pro, Free, Tp } from "@iconsax/icons";

<Pro.Linear.AiHome />
<Free.Bold.Home />
<Tp.Solid.Brain />
```

All icons accept the standard React `SVGProps<SVGSVGElement>`:

```tsx
<AiHome width={48} height={48} stroke="currentColor" className="my-icon" />
```

The icons render `stroke="currentColor"` / `fill="currentColor"` so they
inherit the surrounding text color out of the box.

### Raw SVGs

Every SVG is shipped on disk under `svg/<source>/<style>/<name>.svg`:

```ts
import linearHomeUrl from "@iconsax/icons/svg/pro/linear/ai-home.svg";
```

## What's in the box

- `dist/<source>/<style>/<Component>.{js,d.ts}` — compiled React components (ESM + types).
- `svg/<source>/<style>/<name>.svg` — raw SVG files.
- `icons-<source>.json` — manifest for each source (category + available styles per icon).
- `scripts/` — crawler, importer, generator, build.

## Regenerating from scratch

When Iconsax adds new icons or TP gets new custom icons:

```bash
cp .env.example .env   # fill in ICONSAX_TOKEN (your Iconsax Pro API key)
npm install

# 1. Refresh Iconsax sources (resumable; skips icons already on disk).
npm run crawl:free
npm run crawl:pro

# 2. Refresh TP Medical icons from the source repo on disk.
npm run import:tp

# 3. Regenerate components and rebuild dist/.
npm run generate
npm run build
```

The crawlers are resumable — they persist progress in `crawl-state/` and skip
already-downloaded SVGs on re-runs.

## License

The Iconsax icons themselves are licensed by Iconsax under the terms of your
Iconsax subscription. The TP Medical icons are owned by TP. This packaging
code is provided for use within projects that hold the appropriate licenses.
