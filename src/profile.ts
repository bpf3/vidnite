import { parseArgs } from "node:util";
import { join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { Blob } from "node:buffer";

import { AtpAgent } from "twoot/dist/raw-client/bsky.js";
import { createClient } from "twoot/dist/raw-client/masto.js";

import { close as flushSentry } from "@sentry/node";

import { randomInArray } from "./util/index.ts";
import {
  BSKY_PASSWORD,
  BSKY_USERNAME,
  MASTODON_SERVER,
  MASTODON_TOKEN,
  PERSIST_DIR,
} from "./env.ts";

const USED_BANNERS_FILE = "used-banners";
const BANNERS_DIR = "banners";

async function setProfileBannerMasto(blob: Blob) {
  const client = createClient({
    url: MASTODON_SERVER,
    accessToken: MASTODON_TOKEN,
  });

  await client.v1.accounts.updateCredentials({ header: blob });
}

async function setProfileBannerBsky(blob: Blob) {
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: BSKY_USERNAME, password: BSKY_PASSWORD });

  await agent.upsertProfile(async (existingProfile) => {
    const existing = existingProfile ?? {};
    const { data } = await agent.uploadBlob(blob);
    existing.banner = data.blob;
    return existing;
  });
}

const {
  values: { local },
} = parseArgs({ options: { local: { type: "boolean" } } });

if (local) {
  console.log("running locally!");
}

/**
 * this is more complicated and less performant than just keeping the list of
 * _unused_ banners in a file, but it means if we add more banners on the fly we
 * don't have to wait a full rotation to see them.
 */
async function setProfileBanner(): Promise<void> {
  let used: string[];
  const usedFn = join(PERSIST_DIR, USED_BANNERS_FILE);
  try {
    const file = await readFile(usedFn, "utf8");
    used = file.split("\n");
  } catch (e: unknown) {
    console.error(
      `Error when reading ${usedFn}:\n`,
      e,
      "\n\nIgnoring and using empty array.",
    );
    used = [];
  }

  const bannerFns = await readdir(join(PERSIST_DIR, BANNERS_DIR));

  let unused = [...new Set(bannerFns).difference(new Set(used))];

  if (unused.length === 0) {
    console.warn(
      "no unused banners remaining. resetting list of used banners.",
    );
    unused = bannerFns;
    used = [];
  }

  const banner = randomInArray(unused);

  const buff = await readFile(join(PERSIST_DIR, BANNERS_DIR, banner));
  const blob = new Blob([buff]);

  console.log(`setting profile banner to "${banner}"`);
  if (!local) {
    await Promise.all([
      setProfileBannerBsky(blob),
      setProfileBannerMasto(blob),
    ]);
  }

  used.push(banner);
  await writeFile(usedFn, used.join("\n"));
}

await setProfileBanner();
await flushSentry(2000);
