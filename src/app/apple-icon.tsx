import { ImageResponse } from "next/og";
import { LiveImprovedTileIcon } from "@/components/brand/LiveImprovedLogo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<LiveImprovedTileIcon style={{ width: "100%", height: "100%" }} />, { ...size });
}
