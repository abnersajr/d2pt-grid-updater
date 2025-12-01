import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";

const GRIDS_FOLDER = "./grids";
const HASHES_FILE = "./grid_hashes.txt";

async function calculateMD5(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  const hash = createHash("md5");
  hash.update(content);
  return hash.digest("hex");
}

async function main() {
  console.log("Generating MD5 hashes for grid files...");

  // Find all .json files in the grids folder
  const files = await fs.readdir(GRIDS_FOLDER);
  const jsonFiles = files
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(GRIDS_FOLDER, file));

  if (jsonFiles.length === 0) {
    console.log("No .json files found in grids folder.");
    return;
  }

  console.log(`Found ${jsonFiles.length} grid files.`);

  // Calculate hashes for all files
  const hashEntries: string[] = [];
  for (const filePath of jsonFiles) {
    const filename = filePath.split("/").pop()!; // Get filename from path
    const hash = await calculateMD5(filePath);
    hashEntries.push(`${filename},${hash}`);
    console.log(`Processed: ${filename} -> ${hash}`);
  }

  // Write to grid_hashes.txt
  const content = hashEntries.join("\n") + "\n";
  await fs.writeFile(HASHES_FILE, content, "utf8");

  console.log(`Generated ${HASHES_FILE} with ${hashEntries.length} entries.`);
}

main().catch(console.error);
