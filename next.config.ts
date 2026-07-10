import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  typedRoutes: true,
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next"
};

export default withNextIntl(nextConfig);
