import { build, context } from "esbuild";
import { copyFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const INSTALLED = join(
  homedir(),
  "Library/Application Support/Recordly/extensions/recordly-click-ripple/dist/index.js",
);

function deployToInstalled() {
  if (existsSync(INSTALLED)) {
    copyFileSync("dist/index.js", INSTALLED);
    console.log("Deployed → " + INSTALLED);
  }
}

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
  const ctx = await context({
    ...config,
    plugins: [{
      name: "deploy-on-rebuild",
      setup(b) { b.onEnd(() => deployToInstalled()); },
    }],
  });
  await ctx.watch();
  console.log("Watching src/ — Ctrl-C to stop");
} else {
  await build(config);
  console.log("Built dist/index.js");
  deployToInstalled();
}
