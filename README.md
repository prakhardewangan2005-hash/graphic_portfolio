# Graphic Design Portfolio — Prakhar Dewangan

A static graphic-design portfolio with a scroll-driven profile-photo animation (240 frames).

## Structure

```
index.html                 the portfolio page
effects.css / effects.js   BorderGlow · SplashCursor · HeroSilk (vanilla ports)
assets/                    the five project images
ezgif-frame-001…240.jpg    scroll animation frames
vercel.json                cache headers for frames and assets
```

No build step — it is plain HTML, CSS and JavaScript with no dependencies.

## Deploying

**Vercel** — import the repo and accept the defaults; leave the build command empty.

**GitHub Pages** — Settings → Pages → deploy from branch `main`, folder `/ (root)`.
