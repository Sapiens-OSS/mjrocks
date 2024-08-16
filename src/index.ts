import path from "path";
import fs from "fs";
import yauzl from "yauzl";
import { parseRockspec } from "./rockspec";
import { AssignmentStatement } from "luaparse";

async function recursivelyProcessZip(data: Buffer) {
  const abstractDataTree: { [key: string]: any } = {};

  await new Promise<void>((r) => {
    yauzl.fromBuffer(data, {}, (err, zip) => {
      const promises: Array<Promise<any>> = [];
      if (err) {
        console.log(err);
        throw err;
      }
      zip.once("end", () => {
        zip.close();
        (async () => {
          await Promise.all(promises);
          r();
        })();
      });

      zip.on("entry", (entry) => {
        const promise = (async () => {
          const data = await new Promise<Buffer>((r, e) => {
            const chunks: Uint8Array[] = [];
            zip.openReadStream(entry, (err, stream) => {
              if (err) return e(err);
              stream.on("data", (chunk) => {
                chunks.push(chunk);
              });
              stream.on("end", () => {
                const buffer = Buffer.concat(chunks);
                r(buffer);
              });
            });
          });

          if (entry.fileName.endsWith(".zip")) {
            const zipData = await recursivelyProcessZip(data);
            Object.assign(abstractDataTree, zipData);
          } else {
            abstractDataTree[entry.fileName] = data.toString("utf-8");
          }
        })();

        promises.push(promise);
      });
    });
  });

  return abstractDataTree;
}

(async () => {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error("Input file not specificed");
  const absoluteInputPath = path.resolve(inputFile);

  const zip = await recursivelyProcessZip(fs.readFileSync(absoluteInputPath));

  const baseDir = Object.keys(zip).find((e) => e.endsWith("/"));

  if (!baseDir) throw new Error("source base dir not found");

  const rockspecFilename = Object.keys(zip).find((e) =>
    e.endsWith(".rockspec")
  );
  if (!rockspecFilename)
    throw new Error(".rockspec not found, is it a valid rock?");

  const rockspec = parseRockspec(zip[rockspecFilename]);

  if (rockspec.build.type !== "builtin")
    throw new Error("Build types other than 'builtin' are not supported (yet)");

  const modules: { [key: string]: string } = {};
  const modulesToProcess = Object.entries(rockspec.build.modules);
  for (const [moduleName, source] of modulesToProcess) {
    const filename = path.join(baseDir, source);
    const data = zip[filename];
    if (!data) continue;
    modules[moduleName] = data;
  }

  console.log(Object.keys(modules));
})();
