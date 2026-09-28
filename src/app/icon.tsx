import { ImageResponse } from "next/og";
import { LiveImprovedTileIcon } from "@/components/brand/LiveImprovedLogo";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<LiveImprovedTileIcon style={{ width: "100%", height: "100%" }} />, { ...size });
}
