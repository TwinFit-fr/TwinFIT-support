/**
 * One-off importer: upload local image-generator output/exo_* versions into images.exercise_images.
 *
 * Usage (from TwinFIT-support):
 *   NHOST_ACCESS_TOKEN=... NEXT_PUBLIC_NHOST_SUBDOMAIN=... NEXT_PUBLIC_NHOST_REGION=... \
 *     npx tsx scripts/images/import-legacy.ts [path-to-image-generator]
 *
 * Defaults to ../image-generator relative to TwinFIT-support.
 * Images are imported inactive (position null) so you can assign slots in the Studio UI.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type Manifest = {
  exo_id: number;
  versions: { filename: string; created_at?: string; mode?: string; prompt?: string }[];
};

async function main() {
  const token = process.env.NHOST_ACCESS_TOKEN;
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!token || !subdomain || !region) {
    throw new Error(
      "Set NHOST_ACCESS_TOKEN, NEXT_PUBLIC_NHOST_SUBDOMAIN, NEXT_PUBLIC_NHOST_REGION",
    );
  }

  const root =
    process.argv[2] || path.resolve(process.cwd(), "..", "image-generator");
  const outputDir = path.join(root, "output");
  const entries = await readdir(outputDir, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory() && e.name.startsWith("exo_"));

  console.log(`Found ${folders.length} exo folders in ${outputDir}`);

  const graphqlUrl = `https://${subdomain}.graphql.${region}.nhost.run/v1`;
  const storageUrl = `https://${subdomain}.storage.${region}.nhost.run/v1/files`;

  async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-hasura-role": "staff",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }
    return json.data as T;
  }

  for (const folder of folders) {
    const exoId = Number(folder.name.replace("exo_", ""));
    if (!Number.isFinite(exoId)) continue;
    const folderPath = path.join(outputDir, folder.name);
    const manifestPath = path.join(folderPath, "manifest.json");
    let versions: Manifest["versions"] = [];
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
      versions = manifest.versions ?? [];
    } catch {
      const files = await readdir(folderPath);
      versions = files
        .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .map((filename) => ({ filename }));
    }

    const exercise = await gql<{ catalog_exercises: { exo_id: number }[] }>(
      `query($exoId: Int!) {
        catalog_exercises(where: { exo_id: { _eq: $exoId } }, limit: 1) { exo_id }
      }`,
      { exoId },
    );
    if (!exercise.catalog_exercises?.[0]) {
      console.error(`Exercise exo_id=${exoId} not found in Nhost`);
      continue;
    }

    for (const version of versions) {
      const filePath = path.join(folderPath, version.filename);
      const bytes = await readFile(filePath);
      const mime = version.filename.endsWith(".webp")
        ? "image/webp"
        : version.filename.endsWith(".jpg") || version.filename.endsWith(".jpeg")
          ? "image/jpeg"
          : "image/png";

      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), version.filename);

      const uploadRes = await fetch(storageUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-hasura-role": "staff",
          "x-nhost-bucket-id": "exercise-images",
          "x-nhost-file-name": `exo_${exoId}/legacy-${version.filename}`,
        },
        body: form,
      });
      const uploadBody = (await uploadRes.json()) as {
        id?: string;
        processedFiles?: { id: string }[];
        fileMetadata?: { id: string };
      };
      if (!uploadRes.ok) {
        console.error(`Upload failed exo_${exoId}/${version.filename}`, uploadBody);
        continue;
      }
      const fileId =
        uploadBody.processedFiles?.[0]?.id ?? uploadBody.id ?? uploadBody.fileMetadata?.id;
      if (!fileId) {
        console.error(`No file id for exo_${exoId}/${version.filename}`, uploadBody);
        continue;
      }

      const imageUrl = `https://${subdomain}.storage.${region}.nhost.run/v1/files/${fileId}`;
      const inserted = await gql<{
        insert_images_exercise_images_one: { id: string };
      }>(
        `mutation($object: images_exercise_images_insert_input!) {
          insert_images_exercise_images_one(object: $object) { id }
        }`,
        {
          object: {
            exo_id: exoId,
            file_id: fileId,
            image_url: imageUrl,
            active: false,
            position: null,
            prompt: version.prompt ?? "Imported from image-generator",
            model: "legacy-import",
            params: {},
          },
        },
      );
      console.log(
        `Imported exo_${exoId}/${version.filename} -> ${inserted.insert_images_exercise_images_one.id}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
