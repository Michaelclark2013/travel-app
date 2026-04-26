"use client";

import qrcode from "qrcode-generator";

export function qrCodeSvg(
  data: string,
  opts: { size?: number; margin?: number; fg?: string; bg?: string } = {}
): string {
  const { size = 160, margin = 2, fg = "#0f1117", bg = "#ffffff" } = opts;
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / (count + margin * 2);

  let body = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const x = (c + margin) * cell;
        const y = (r + margin) * cell;
        body += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${bg}"/><g fill="${fg}">${body}</g></svg>`;
}

export function qrDataUrl(data: string, opts?: Parameters<typeof qrCodeSvg>[1]): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrCodeSvg(data, opts))}`;
}
