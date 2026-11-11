import fs from "node:fs";
const html = fs.readFileSync("dist/index.html", "utf8");
const jsPath = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPath = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
if (!jsPath || !cssPath) throw new Error("Build first: npm run build");
const js = fs
  .readFileSync("dist/" + jsPath.replace(/^\.\//, ""), "utf8")
  .replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync("dist/" + cssPath.replace(/^\.\//, ""), "utf8");
const output = html
  .replace(
    /<script[^>]+src="[^"]+"[^>]*><\/script>/,
    () => '<script type="module">' + js + "</script>",
  )
  .replace(
    /<link[^>]+href="[^"]+\.css"[^>]*>/,
    () => "<style>" + css + "</style>",
  );
fs.writeFileSync("dist/night-warden.html", output);
process.stdout.write("Standalone game: dist/night-warden.html\n");
