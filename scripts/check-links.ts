/**
 * Link check over the built site: every page in ./dist and every link on it, external ones included.
 * Settings live in .linkinator.config.json (linkinator's own option names), plus one key of ours:
 *
 *   botBlocks: { host: [status, ...] }
 *
 * Instagram and Calendly answer automated clients (especially from datacenter IPs such as CI
 * runners) with 429 or the non-standard 999 instead of the page. linkinator first retries a 429
 * that carries retry-after ("retry") and retries 5xx/network errors ("retryErrors"). A link that
 * still fails with one of its host's listed codes is reported as a warning, not a failure: the
 * server answered, it only refused the bot. The link is still requested, so a 404 or a dead host
 * fails the check. linkinator's own "statusCodes" setting cannot do this per host.
 *
 * Nothing is skipped: the canonical, hreflang and og:image URLs on https://zavocreates.com/ are
 * checked against the live site (served by this Worker since go-live). A "skip" pattern list is
 * still read from the config if one is ever needed.
 *
 * Usage: node --experimental-strip-types scripts/check-links.ts [glob ...]   (relative to serverRoot "dist"; default: *.html)
 */
import { readFile } from "node:fs/promises";
import { check, LinkState, type CheckOptions } from "linkinator";

type Config = Omit<CheckOptions, "path" | "linksToSkip"> & {
  skip?: string | string[];
  botBlocks?: Record<string, number[]>;
};

const { skip, botBlocks = {}, ...options } = JSON.parse(
  await readFile(new URL("../.linkinator.config.json", import.meta.url), "utf8"),
) as Config;

// Every page, not only what index.html links to: /pricing and /pricing-ro are not linked from /.
const path = process.argv.length > 2 ? process.argv.slice(2) : ["*.html"];

const result = await check({
  ...options,
  path,
  linksToSkip: skip === undefined ? [] : [skip].flat(),
});

const allowedBlock = (url: string, status: number | undefined) => {
  if (status === undefined) return false;
  const host = URL.canParse(url) ? new URL(url).hostname : "";
  return botBlocks[host]?.includes(status) ?? false;
};

const broken = result.links.filter((link) => link.state === LinkState.BROKEN);
const blocked = broken.filter((link) => allowedBlock(link.url, link.status));
const failed = broken.filter((link) => !blocked.includes(link));
const ok = result.links.filter((link) => link.state === LinkState.OK).length;
const skipped = result.links.filter((link) => link.state === LinkState.SKIPPED).length;

for (const link of blocked) console.warn(`WARN [${link.status}] bot block, allowed for this host: ${link.url}`);
for (const link of failed) console.error(`BROKEN [${link.status ?? "no response"}] ${link.url}  (on ${link.parent ?? "?"})`);
console.log(`${result.links.length} links: ${ok} ok, ${skipped} skipped, ${blocked.length} bot-blocked (allowed), ${failed.length} broken.`);

process.exit(failed.length > 0 ? 1 : 0);
