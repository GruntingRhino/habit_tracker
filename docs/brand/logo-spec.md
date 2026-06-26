# LiveImproved Logo Spec

## Canonical Assets

- App icon: `public/brand/liveimproved-app-icon.svg`
- Social avatar: `public/brand/liveimproved-social-avatar.svg`
- Mark for dark surfaces: `public/brand/liveimproved-mark-light.svg`
- Mark for light surfaces: `public/brand/liveimproved-mark-dark.svg`
- Reusable React components: `src/components/brand/LiveImprovedLogo.tsx`

## Brand Geometry

- Master tile: `256 x 256`
- Tile frame: `x=8`, `y=8`, `w=240`, `h=240`, `rx=54`
- Mark placement inside tile: `translate(80 78) scale(0.3902439)`
- Mark clear space: preserve at least `12%` of the tile width around the glyph
- Recommended minimum sizes:
  - Navbar icon: `24px`
  - Favicon export: `32px`
  - Social avatar export: `512px`
  - App icon export: `512px`

## Color System

- Tile base: `#0D121A`
- Tile stroke: `#2A3340`
- Subtle highlight stroke: `rgba(255,255,255,0.05)`
- Light mark: `#F8FAFC`
- Dark mark: `#0D121A`

## Surface Rules

- App icon: always use the tile plus light mark.
- Navbar and in-app chrome: use the tile icon at `26px` to `32px`, paired with the `LiveImproved` wordmark.
- Favicon: use the tile icon, not the mark alone. The tile preserves contrast at `16px` and `32px`.
- Social avatars: use the tile icon only. Do not add text.
- Light backgrounds: use `liveimproved-mark-dark.svg` only if the tile cannot be used.
- Dark backgrounds: prefer the tile icon; otherwise use `liveimproved-mark-light.svg`.

## Constraints

- Do not stretch the glyph or tile independently.
- Do not recolor the glyph with gradients.
- Do not place the mark directly on noisy photography.
- Do not add inner symbols, badges, or notification dots to the icon.
- Do not use drop shadows heavier than the current tile treatment.

## Implementation Notes

- `src/app/icon.tsx` and `src/app/apple-icon.tsx` should stay aligned with `LiveImprovedTileIcon`.
- `src/app/manifest.ts` should reference the exported raster files for install surfaces.
- `src/app/favicon.ico` should remain a rasterized tile icon for browser compatibility.
