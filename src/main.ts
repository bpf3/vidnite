import { parseArgs } from "node:util";
import { join } from "node:path";
import { readdir, rename } from "node:fs/promises";

import { twoot } from "twoot";
import { close as flushSentry } from "@sentry/node";

import {
  BSKY_PASSWORD,
  BSKY_USERNAME,
  MASTODON_SERVER,
  MASTODON_TOKEN,
  PERSIST_DIR,
} from "./env.ts";

const QUEUE_DIR = "queue";
const DONE_DIR = "done";

async function doTwoot(filename: string): Promise<void> {
  const results = await twoot({ status: "", media: [{ path: filename }] }, [
    {
      type: "mastodon",
      server: MASTODON_SERVER,
      token: MASTODON_TOKEN,
    },
    {
      type: "bsky",
      username: BSKY_USERNAME,
      password: BSKY_PASSWORD,
    },
  ]);

  for (const res of results) {
    switch (res.type) {
      case "mastodon":
        console.log(`tooted at ${res.status.url}`);
        break;
      case "bsky":
        console.log(`skeeted at ${res.status.uri}`);
        break;
      case "error":
        console.error(`error while tooting:\n${res.message}`);
        break;
      default:
        throw new Error(`unexpected value:\n${JSON.stringify(res)}`);
    }
  }
}

const {
  values: { local },
} = parseArgs({ options: { local: { type: "boolean" } } });

if (local) {
  console.log("running locally!");
}

async function postFromQueue(): Promise<void> {
  const queueImages = await readdir(join(PERSIST_DIR, QUEUE_DIR));

  if (queueImages.length === 0) {
    console.warn("No images in queue. Exiting.");
    return;
  }

  queueImages.sort();
  const imageFn = queueImages.shift()!;

  const filename = join(PERSIST_DIR, QUEUE_DIR, imageFn);

  console.log(`posting image from queue: "${filename}"`);
  if (!local) {
    await doTwoot(filename);
  }

  await rename(filename, join(PERSIST_DIR, DONE_DIR, imageFn));
}

await postFromQueue();
await flushSentry(2000);
