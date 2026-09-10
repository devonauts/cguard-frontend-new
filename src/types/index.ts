import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export * from "./client";
export * from "./schedule";
export * from "./station";
export * from "./postSite";
export * from "./securityGuard";
