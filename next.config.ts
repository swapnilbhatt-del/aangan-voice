import type { NextConfig } from "next";

const config: NextConfig = {
  // The verdict reads qualified.md and services.md at runtime; ship them with the functions.
  outputFileTracingIncludes: { "/api/**": ["./source/qualified.md", "./source/services.md"] },
};

export default config;
