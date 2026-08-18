# Wanted Sans webfont bundle

This folder contains the Korean-capable `Wanted Sans` webfont package used for
display typography such as headings and buttons.

## Included

- `static/complete/WantedSans.css`
- `static/complete/woff2/WantedSans-Regular.woff2`
- `static/complete/woff2/WantedSans-Medium.woff2`
- `static/complete/woff2/WantedSans-SemiBold.woff2`
- `static/complete/woff2/WantedSans-Bold.woff2`
- `static/complete/woff2/WantedSans-ExtraBold.woff2`
- `static/complete/woff2/WantedSans-Black.woff2`
- `static/complete/woff2/WantedSans-ExtraBlack.woff2`
- `OFL.txt`

The complete static package is intentional: it keeps the CSS and font paths
simple and includes every supported weight without the split unicode-range
files.

## Use

Load the stylesheet from the same folder so its relative `woff2` paths remain
valid:

```html
<link rel="stylesheet" href="/runtime/storefront/assets/fonts/wanted-sans/static/complete/WantedSans.css">
```

Then use the family with the weight required by the design:

```css
font-family: "Wanted Sans", sans-serif;
font-weight: 600;
```

Available weights are `400`, `500`, `600`, `700`, `800`, `900`, and `1000`.

## Source

- Repository: https://github.com/wanteddev/wanted-sans
- Source tree commit: `02c9b822349c188ada95f9e2d90c2ed18f853235`
- Webfont documentation: `packages/wanted-sans/documentation/webfonts/README-EN.md`
- License: `OFL.txt`

`Wanted Sans Std` is not included because it is the Latin-only package. The
Korean-capable `Wanted Sans` family is the correct package for this site.

The variable-font source remains available at
`packages/wanted-sans/fonts/webfonts/variable/complete/`; this local bundle
uses the fixed-weight files above for predictable browser loading.
