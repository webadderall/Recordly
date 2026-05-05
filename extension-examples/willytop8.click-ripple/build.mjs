import { build, context } from "esbuild";

const config = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  minify: false,
  sourcemap: false,
};

if (process.argv.includes("--watch")) {
  const ctx = await context(config);
  await ctx.watch();
  console.log("Watching src/ — Ctrl-C to stop");
} else {
  await build(config);
  console.log("Built dist/index.js");
}
