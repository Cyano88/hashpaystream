import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(path.join(tmpdir(), "trade-native-photo-"));
const result = await build({
  entryPoints: ["src/lib/tradeApi.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "native",
      setup(b) {
        b.onResolve({ filter: /^@capacitor\/core$/ }, () => ({
          path: "native",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: "export const Capacitor={isNativePlatform:()=>true}",
        }));
      },
    },
  ],
});
const oldFetch = globalThis.fetch,
  oldWindow = globalThis.window;
try {
  const modulePath = path.join(directory, "photo.mjs");
  await writeFile(modulePath, result.outputFiles[0].text);
  globalThis.window = { setTimeout, clearTimeout };
  const { tradePhotoSource } = await import(pathToFileURL(modulePath));
  globalThis.fetch = async (url) => {
    assert.equal(
      url,
      "/api/hashpaystream/v1/trade/photos/id/0?v=1&format=json",
    );
    return Response.json({
      ok: true,
      photo: "data:image/jpeg;base64,synthetic",
    });
  };
  assert.equal(
    await tradePhotoSource("/api/hashpaystream/v1/trade/photos/id/0?v=1"),
    "data:image/jpeg;base64,synthetic",
  );
  assert.equal(
    await tradePhotoSource("data:image/jpeg;base64,local"),
    "data:image/jpeg;base64,local",
  );
  globalThis.fetch = async () => Response.json({ ok: false }, { status: 404 });
  await assert.rejects(() =>
    tradePhotoSource("/api/hashpaystream/v1/trade/photos/id/0?v=1"),
  );
  console.log(
    "Android Trade photo JSON transport, local-image passthrough and failure handling passed.",
  );
} finally {
  globalThis.fetch = oldFetch;
  globalThis.window = oldWindow;
  if (
    path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith("trade-native-photo-")
  )
    throw new Error("Invalid cleanup path");
  await rm(directory, { recursive: true, force: true });
}
