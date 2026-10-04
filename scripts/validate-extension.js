import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest.json must use Manifest V3");
const paths = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...manifest.content_scripts.flatMap((entry) => entry.js)];
for (const path of paths) await access(new URL(`../${path}`, import.meta.url), constants.R_OK);
if (!manifest.host_permissions.includes("https://jisho.org/*")) throw new Error("Jisho host permission is missing");
console.log(`Validated ${manifest.name} v${manifest.version}: ${paths.length} entry points found.`);
