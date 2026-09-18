// Inline SVG placeholder used by the download-tool mock UIs — avoids relying
// on a third-party image host (via.placeholder.com has repeatedly gone down),
// keeping the demo data fully self-contained like the rest of this app.
export function placeholderImage(text: string, w = 400, h = 225) {
  const fontSize = Math.round(Math.min(w, h) / 9);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="#e2e5ea"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#7a8698">${text}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
