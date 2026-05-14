# tp_icon

A unified icon library combining Iconsax (free + Pro) with TatvaPractice's
custom medical icons, packaged as React components plus raw SVGs.

| Metric | Count |
|--------|------:|
| Unique component names | 6,769 |
| Total React components | 25,165 |
| Styles | 6 (bold · broken · bulk · linear · outline · twotone) |
| Sources merged | Iconsax free, Iconsax Pro, TatvaPractice Medical |

## Install

```bash
npm install github:shyamgrdesign2-dot/iconsax
# or pin a tag (recommended):
npm install github:shyamgrdesign2-dot/iconsax#v0.3.0
```

The package's name is `tp_icon`.

## Usage

```tsx
// Subpath imports — your bundler tree-shakes the unused icons.
import { AiHome, Home, Ambulance } from "tp_icon/linear";

export const Header = () => (
  <header>
    <AiHome    width={32} height={32} />
    <Home      width={32} height={32} />
    <Ambulance width={32} height={32} color="#7c3aed" />
  </header>
);
```

```tsx
// Or namespace style.
import { Linear, Bold, Bulk } from "tp_icon";

<Linear.AiHome />
<Bold.Home />
<Bulk.Ambulance />
```

All icons accept the standard React `SVGProps<SVGSVGElement>`. They render with
`stroke="currentColor"` / `fill="currentColor"` so they inherit the surrounding
text color out of the box:

```tsx
<AiHome width={48} height={48} color="#7c3aed" className="my-icon" />
```

### Raw SVGs

Every SVG is also shipped under `svg/<style>/<name>.svg`:

```ts
import linearHomeUrl from "tp_icon/svg/linear/home-pro.svg";
```

## Naming

- **Single namespace.** All icons live in one flat set; no source prefix on
  imports. There are no `free/` / `pro/` / `tp/` import paths anymore.
- **Style mapping.** TP's three styles map into Iconsax's six like so:
  `line → linear`, `bulk → bulk`, `solid → bold`. TP icons therefore appear in
  three of the six style folders; the other three just don't have a TP version.
- **Name collisions.** When two sources both define the same icon name with
  different artwork, both are kept and tagged with a source suffix:

  | Original | Pro version | Free version | TP version |
  |----------|-------------|--------------|------------|
  | `home`   | `HomePro`   | `HomeFree`   | — |
  | `ambulance` | — | — | `Ambulance` (no suffix; unique to TP) |

  Source priority for the "winner" of unprefixed forms: **pro > free > tp**.
  In practice every collision gets suffixed so consumers always know which
  artwork they are picking. The `-pro` / `-free` / `-tp` suffix uses a hyphen
  so it never collides with Iconsax's own numeric suffixes (`home-1`, `home-2`,
  …).
- **TP icons.** Custom TatvaPractice icons (e.g. medical) are merged into the
  same namespace with no special prefix unless they collide with an Iconsax
  name. So `Brain`, `Ambulance`, `Stethoscope` etc. import directly.

The `icons.json` manifest records the source, original (pre-collision) name,
and available styles for every component:

```json
{
  "HomePro":   { "source": "pro",  "originalName": "home", "styles": ["bold", "broken", "bulk", "linear", "outline", "twotone"] },
  "HomeFree":  { "source": "free", "originalName": "home", "styles": [...] },
  "Ambulance": { "source": "tp",   "originalName": "ambulance", "styles": ["bold", "bulk", "linear"] }
}
```

## What's in the box

- `dist/<style>/<Component>.{js,d.ts}` — compiled React components (ESM + types).
- `svg/<style>/<name>.svg` — flat raw-SVG tree.
- `icons.json` — per-icon manifest (source attribution + style availability).
- `scripts/` — crawler, importer, merger, generator, build pipeline.

## Regenerating from scratch

When Iconsax adds icons or TP adds new custom ones:

```bash
cp .env.example .env   # add your ICONSAX_TOKEN (Iconsax Pro API key)
npm install

# 1. Refresh Iconsax sources (resumable; skips icons already on disk).
npm run crawl:free
npm run crawl:pro

# 2. Refresh TP Medical icons from the source directory on disk.
npm run import:tp

# 3. Merge sources → flat svg/ + icons.json, then build dist/.
npm run rebuild:all   # = merge && generate && build
```

The crawlers persist progress under `crawl-state/` so they survive Ctrl+C.

## License

Iconsax icons are licensed by Iconsax under the terms of your subscription.
TatvaPractice's custom icons are owned by TatvaPractice. The packaging code
in this repository is provided for projects holding the relevant licenses.
