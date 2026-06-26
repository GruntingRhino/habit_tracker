import type { SVGProps } from "react";

const MARK_PATH =
  "M 154.2 0.0 L 145.1 2.4 L 136.0 8.3 L 129.2 18.3 L 127.2 26.2 L 127.6 81.5 L 130.8 94.6 L 136.7 106.9 L 150.3 120.0 L 159.8 123.2 L 167.4 123.2 L 174.5 121.2 L 182.5 116.1 L 187.6 110.1 L 192.4 99.8 L 193.6 62.0 L 192.0 60.0 L 182.1 60.4 L 170.5 64.8 L 155.8 76.7 L 145.9 92.6 L 141.5 76.7 L 141.9 27.8 L 149.1 17.9 L 154.6 15.5 L 163.0 15.5 L 170.1 18.7 L 175.3 23.9 L 180.5 41.3 L 190.0 41.3 L 198.4 43.7 L 210.3 54.5 L 214.3 64.8 L 214.3 75.5 L 210.7 85.1 L 203.9 94.6 L 216.2 99.8 L 224.6 106.9 L 230.2 116.5 L 232.1 128.0 L 230.2 139.1 L 224.2 149.5 L 216.6 156.2 L 203.9 162.2 L 211.9 173.3 L 214.3 180.5 L 214.3 191.6 L 210.3 201.5 L 198.0 212.3 L 179.7 214.7 L 178.5 225.4 L 175.7 231.8 L 169.7 237.7 L 163.0 240.5 L 155.0 240.5 L 149.5 238.1 L 142.3 229.0 L 141.5 179.3 L 144.3 167.0 L 147.1 163.8 L 154.2 177.7 L 167.8 190.0 L 180.5 195.6 L 192.0 196.4 L 193.6 194.0 L 192.4 157.8 L 188.0 147.9 L 180.5 139.1 L 167.4 133.2 L 159.4 133.2 L 149.5 136.7 L 139.9 145.1 L 134.4 153.4 L 129.2 166.6 L 127.2 178.9 L 128.0 232.5 L 132.4 242.5 L 141.1 250.8 L 152.2 255.2 L 163.0 255.6 L 171.3 253.6 L 180.5 248.4 L 188.8 238.9 L 192.8 229.8 L 211.5 221.8 L 223.0 209.1 L 227.8 198.0 L 229.4 187.6 L 225.8 167.8 L 235.3 158.6 L 242.1 147.5 L 245.7 135.6 L 246.1 122.4 L 240.9 105.3 L 225.8 87.9 L 229.0 76.7 L 229.0 63.6 L 226.2 52.9 L 220.2 42.1 L 208.3 31.4 L 192.8 25.8 L 186.0 12.7 L 178.1 5.6 L 167.0 0.8 Z M 159.0 147.9 L 167.0 147.9 L 176.5 156.2 L 179.3 163.8 L 178.5 180.1 L 171.3 175.3 L 161.8 164.2 L 157.0 152.6 Z M 179.3 76.7 L 179.3 93.0 L 176.5 100.6 L 167.4 108.5 L 159.4 108.5 L 157.0 103.8 L 161.8 92.2 L 170.9 81.5 Z M 83.5 0.0 L 66.8 6.4 L 58.0 15.5 L 53.3 25.8 L 38.6 31.0 L 24.2 44.5 L 18.7 56.4 L 16.7 67.6 L 17.1 77.1 L 20.3 88.2 L 11.5 96.2 L 4.0 107.7 L 0.4 119.7 L 0.0 132.8 L 6.0 151.5 L 19.9 168.5 L 17.1 179.3 L 17.1 192.4 L 20.3 203.5 L 25.4 212.7 L 38.2 224.2 L 53.3 229.8 L 60.0 242.9 L 69.2 250.8 L 78.7 254.8 L 91.0 255.6 L 101.4 252.8 L 107.7 248.8 L 115.3 239.7 L 118.5 230.6 L 118.5 174.9 L 114.5 159.4 L 110.1 150.7 L 97.4 137.1 L 88.6 133.6 L 78.7 133.2 L 64.8 139.9 L 57.2 149.1 L 53.7 157.4 L 52.5 194.4 L 55.7 196.8 L 68.4 194.8 L 79.5 189.2 L 91.8 177.7 L 100.2 163.8 L 104.5 179.7 L 103.8 229.0 L 96.6 238.1 L 91.0 240.5 L 83.1 240.5 L 76.3 237.7 L 71.2 232.9 L 67.6 225.8 L 65.6 214.3 L 55.7 214.3 L 47.3 211.9 L 35.0 200.3 L 31.4 189.6 L 31.8 180.5 L 34.2 173.3 L 42.1 162.2 L 30.6 157.0 L 21.9 149.5 L 15.9 139.1 L 13.9 128.8 L 15.9 116.5 L 21.5 106.9 L 29.8 99.8 L 42.1 94.6 L 35.4 85.1 L 31.4 73.1 L 32.2 62.8 L 36.6 53.3 L 47.7 43.7 L 56.4 41.3 L 65.6 41.3 L 70.8 23.9 L 75.9 18.7 L 83.1 15.5 L 95.8 17.1 L 101.0 21.5 L 104.1 27.8 L 104.5 75.9 L 101.8 89.0 L 99.0 92.6 L 89.8 76.3 L 77.5 66.0 L 67.2 61.2 L 55.3 59.6 L 52.5 62.0 L 53.7 99.8 L 57.6 108.9 L 64.0 116.5 L 78.7 123.2 L 86.7 123.2 L 96.6 119.7 L 106.1 111.3 L 111.3 103.8 L 116.5 91.0 L 118.9 77.5 L 118.1 21.5 L 114.5 13.1 L 106.1 4.8 L 96.6 0.8 Z M 86.3 147.5 L 89.0 152.6 L 84.3 164.2 L 75.5 174.5 L 66.8 179.7 L 66.8 163.8 L 69.6 156.2 L 75.9 149.5 L 81.5 147.1 Z M 66.8 76.3 L 75.5 81.9 L 84.7 93.0 L 89.0 103.8 L 86.7 108.5 L 78.7 108.5 L 70.0 101.4 L 66.4 90.2 Z";

export const LIVE_IMPROVED_BRAND = {
  tile: "#0d121a",
  tileStroke: "#2a3340",
  tileHighlight: "#ffffff",
  markLight: "#f8fafc",
  markDark: "#0d121a",
} as const;

type LogoSvgProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

export function LiveImprovedMark({
  title,
  color = "currentColor",
  ...props
}: LogoSvgProps & { color?: string }) {
  return (
    <svg
      viewBox="0 0 246 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d={MARK_PATH} fill={color} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

export function LiveImprovedTileIcon({
  title,
  ...props
}: LogoSvgProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect x="8" y="8" width="240" height="240" rx="54" fill={LIVE_IMPROVED_BRAND.tile} />
      <rect x="8.5" y="8.5" width="239" height="239" rx="53.5" stroke={LIVE_IMPROVED_BRAND.tileStroke} />
      <rect
        x="12.5"
        y="12.5"
        width="231"
        height="231"
        rx="49.5"
        stroke={LIVE_IMPROVED_BRAND.tileHighlight}
        strokeOpacity="0.05"
      />
      <g transform="translate(80 78) scale(0.3902439)">
        <path d={MARK_PATH} fill={LIVE_IMPROVED_BRAND.markLight} fillRule="evenodd" clipRule="evenodd" />
      </g>
    </svg>
  );
}
