# Publishing the package to GitHub

After the crawl + build finishes, the working tree contains everything that
needs to live in the GitHub repo. Here's the one-time setup to host it as an
`npm install github:<user>/<repo>` package.

## 1. Create a GitHub repo

```bash
# Replace placeholders.
GH_USER="your-github-username"
GH_REPO="iconsax-icons"

# On github.com: create a new (empty, no README) public or private repo
# named $GH_REPO under $GH_USER.
```

## 2. Initialize git and push

From this directory:

```bash
git init -b main
git add .
git commit -m "Initial commit: Iconsax icon library (50K SVGs + React components)"
git remote add origin "git@github.com:${GH_USER}/${GH_REPO}.git"
git push -u origin main
```

> **Heads up — repo size.** This repo ships ~50K raw SVG files plus a built
> `dist/`. Total is typically 80–150 MB. Well under GitHub's 1 GB soft cap, but
> shallow clones (`git clone --depth=1`) are recommended for consumers if you
> end up tagging a lot of releases.

## 3. Tag a release (optional but recommended)

`npm install github:user/repo#v0.1.0` is much more reliable than installing
from a moving branch, because consumers cache by ref.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 4. Install in your app

```bash
npm install github:${GH_USER}/${GH_REPO}#v0.1.0
```

```tsx
import { AiHome } from "@iconsax/icons/linear";
<AiHome width={24} height={24} />
```

## Re-crawling later

When Iconsax adds new icons, you can refresh this repo by running:

```bash
npm run crawl:all   # discover + fetch new SVGs (resumable — skips existing)
npm run generate    # regenerate React components
npm run build       # rebuild dist/
git add -A && git commit -m "Refresh icon set" && git tag v0.2.0 && git push --tags
```
