# Graphic Design Portfolio — Prakhar Dewangan

Two static portfolios sharing one scroll-driven profile-photo animation (240 frames).

| Path | Site |
|------|------|
| `/` | Graphic-design portfolio |
| `/product/` | Product-design portfolio — case studies under `/product/work/` |

## Structure

```
index.html                 graphic-design portfolio
effects.css / effects.js   BorderGlow · SplashCursor · HeroSilk (vanilla ports)
assets/                    its five project images
product/
  index.html               product-design portfolio
  work/                    helix · pulse · paris · nexum · noctera + case.css
  assets/                  project imagery for the product site
ezgif-frame-001…240.jpg    shared animation frames
vercel.json                cache headers for frames and assets
```

No build step — it is plain HTML, CSS and JavaScript with no dependencies.

## Deploying

**Vercel** — import the repo and accept the defaults; leave the build command empty.

**GitHub Pages** — Settings → Pages → deploy from branch `main`, folder `/ (root)`.
