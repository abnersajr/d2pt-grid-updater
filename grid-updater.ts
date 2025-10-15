import { chromium } from "playwright";
import { promises as fs } from "fs";
import path from "path";

const GRIDS_STORE_FOLDER = "./grids";
const GRIDS_MD = "./grids.md";
const LAST_UPDATE_FILE = "./last_update.txt";
const README_MD = "./README.md";

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("-f") || argv.includes("--force");
  const repair = argv.includes("--repair") || argv.includes("-r");
  if (force) console.log("Force update enabled (-f)");
  if (repair) console.log("Repair metadata mode enabled (--repair)");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://dota2protracker.com/meta-hero-grids");

  // Wait up to 10 seconds for the ad modal and close it if it appears
  try {
    const closeButton = await page.waitForSelector(
      'button[aria-label="Close announcement"]',
      { timeout: 10000 }
    );
    if (closeButton) {
      await closeButton.click();
      console.log("Ad modal closed.");
    }
  } catch (e) {
    console.log("Ad modal did not appear within 10 seconds.");
  }

  // Find the parent div containing the text 'Dota2ProTracker Meta Hero Grids'
  const metaParentDiv = await page
    .locator('div:has-text("Dota2ProTracker Meta Hero Grids")')
    .first();
  if ((await metaParentDiv.count()) === 0) {
    console.error(
      "Parent div with the specified text 'Dota2ProTracker Meta Hero Grids' not found."
    );
    await browser.close();
    return;
  }

  // Find the element with the last update and patch info
  const updateInfo = await metaParentDiv
    .locator(":scope >> text=/Last update:/")
    .first();
  let dateStr = "unknown_date";
  let patchStr = "unknown_patch"; // formatted for filenames: p7_39d
  let rawPatch = "unknown_patch_raw"; // raw like 7.39d for markdown/README
  if ((await updateInfo.count()) > 0) {
    const updateText = await updateInfo.textContent();
    // Example: 'Last update: Oct 12, 2025 • Patch 7.39d'
    const match = updateText?.match(/Last update: ([^•]+) • Patch ([^\s]+)/);
    if (match && match[1] && match[2]) {
      // Format date to YYYY-MM-DD
      const rawDate = String(match[1]).trim();
      const patch = String(match[2]).trim();
      rawPatch = patch;
      const dateObj = new Date(rawDate);
      if (!isNaN(dateObj.getTime())) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getDate()).padStart(2, "0");
        dateStr = `${yyyy}-${mm}-${dd}`;
      }
      // Patch: 7.39d -> p7_39d (use this for filenames)
      patchStr = "p" + patch.replace(/\./g, "_");
    }
  }

  // Find the parent div containing the text 'Download Hero Grid Configuration'
  const parentDiv = await page
    .locator('div:has-text("Download Hero Grid Configuration")')
    .first();
  if ((await parentDiv.count()) === 0) {
    console.error("Parent div with the specified text not found.");
    await browser.close();
    return;
  }
  console.log("Parent div found.");

  // Read existing grids.md (if present)
  let mdContent = "";
  try {
    mdContent = await fs.readFile(GRIDS_MD, "utf8");
  } catch {
    mdContent = "";
  }

  // Parser: read the first data row (newest) from grids.md table
  function parseFirstRowFromMd(
    content: string
  ): { date?: string; patch?: string } | null {
    if (!content) return null;
    const lines = content.split(/\r?\n/);
    let sepIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i] ?? "";
      if (/^\|?\s*-{2,}/.test(ln.replace(/\|/g, " "))) {
        sepIndex = i;
        break;
      }
    }
    if (sepIndex === -1) return null;
    const dataLineIndex = sepIndex + 1;
    if (dataLineIndex >= lines.length) return null;
    const row = (lines[dataLineIndex] ?? "").trim();
    if (!row || row === "|" || /^\|\s*-+/.test(row)) return null;
    const cols = row.split("|").map((s) => s.trim());
    if (cols.length < 3) return null;
    const date = cols[1] || undefined;
    const patch = cols[2] || undefined;
    return { date, patch };
  }

  // Repair mode: sync last_update.txt and README from grids.md first row if available, otherwise from scraped site; no downloads
  if (repair) {
    const mdRow = parseFirstRowFromMd(mdContent);
    const patchForRepair =
      mdRow?.patch || (rawPatch !== "unknown_patch_raw" ? rawPatch : undefined);
    const dateForRepair =
      mdRow?.date || (dateStr !== "unknown_date" ? dateStr : undefined);
    // If grids.md has no usable row, attempt a reconstruction: download current grids and build initial table.
    const needsRebuild = !mdRow;
    if (needsRebuild && patchForRepair && dateForRepair) {
      try {
        console.log(
          "Repair: grids.md has no valid rows; attempting reconstruction via fresh downloads."
        );
        // Attempt to locate download buttons (parentDiv already resolved earlier in script)
        const downloadButtons = await parentDiv.locator(
          'button:has-text("Download")'
        );
        const buttonCount = await downloadButtons.count();
        if (buttonCount < 3) {
          console.error(
            `Repair: expected 3 download buttons, found ${buttonCount}. Aborting reconstruction.`
          );
        } else {
          await fs.mkdir(GRIDS_STORE_FOLDER, { recursive: true });
          const savedFiles: string[] = [];
          // Reuse patchStr/dateStr already computed for file naming (ensure they are not unknown)
          const effectiveDate =
            dateStr !== "unknown_date" ? dateStr : dateForRepair;
          const effectivePatchStr =
            patchStr !== "punknown_patch_raw"
              ? patchStr
              : "p" + (patchForRepair || "unknown").replace(/\./g, "_");
          for (let i = 0; i < 3; i++) {
            const [download] = await Promise.all([
              page.waitForEvent("download"),
              downloadButtons.nth(i).click(),
            ]);
            const suggestedFilename = download
              .suggestedFilename()
              .replace(/\.json$/, "");
            const savePath = `${GRIDS_STORE_FOLDER}/${suggestedFilename}_${effectiveDate}_${effectivePatchStr}.json`;
            await download.saveAs(savePath);
            savedFiles.push(path.basename(savePath));
            console.log(`Repair: downloaded ${path.basename(savePath)}`);
          }
          const linkFile = (fname?: string) =>
            fname ? `[🔗 Download](grids/${fname})` : "";
          const newRow = `| ${effectiveDate} | ${patchForRepair} | ${linkFile(
            savedFiles[0]
          )} | ${linkFile(savedFiles[1])} | ${linkFile(savedFiles[2])} |`;
          const table = `| Date | Patch | D2PT Rating | High Winrate | Most Played |\n| ---- | ----- | ----------- | ------------ | ----------- |\n${newRow}\n`;
          await fs.writeFile(GRIDS_MD, table, "utf8");
          console.log("Repair: rebuilt grids.md with new table and first row.");
        }
      } catch (err) {
        console.error("Repair: failed during reconstruction:", err);
      }
    }
    if (patchForRepair && dateForRepair) {
      await writeLastUpdateFile(patchForRepair, dateForRepair);
      await updateReadmeLastUpdate(patchForRepair, dateForRepair);
      console.log(
        `Repaired ${
          needsRebuild ? "and rebuilt grids.md " : "metadata "
        }using ${
          mdRow ? "grids.md" : "site scrape"
        }: ${dateForRepair} • Patch ${patchForRepair}`
      );
    } else {
      console.error(
        "Unable to repair metadata: no valid date/patch found in grids.md or site."
      );
    }
    await browser.close();
    return;
  }

  // Check if a row with the given date/patch already exists in grids.md
  function hasEntryInMd(
    content: string,
    date: string,
    patchA: string,
    patchB?: string
  ): boolean {
    if (!content) return false;
    const lines = content.split(/\r?\n/);
    // Find the separator line (under the header row)
    let sepIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i] ?? "";
      if (/^\|?\s*-{2,}/.test(ln.replace(/\|/g, " "))) {
        sepIndex = i;
        break;
      }
    }
    if (sepIndex === -1) return false;
    for (let i = sepIndex + 1; i < lines.length; i++) {
      const row = (lines[i] ?? "").trim();
      if (!row || row === "|") continue;
      const cols = row.split("|").map((s) => s.trim());
      if (cols.length < 3) continue;
      const d = cols[1];
      const p = cols[2];
      if (d === date && (p === patchA || (patchB ? p === patchB : false))) {
        return true;
      }
    }
    return false;
  }

  // last_update.txt helpers
  async function readLastUpdateFile(): Promise<{
    date?: string;
    patch?: string;
  } | null> {
    try {
      const txt = await fs.readFile(LAST_UPDATE_FILE, "utf8");
      const lines = txt.split(/\r?\n/);
      const patch = (lines[0] ?? "").trim() || undefined;
      const date = (lines[1] ?? "").trim() || undefined;
      if (!patch || !date) return null;
      return { patch, date };
    } catch {
      return null;
    }
  }

  async function writeLastUpdateFile(
    patch: string,
    date: string
  ): Promise<void> {
    const content = `${patch}\n${date}\n`;
    await fs.writeFile(LAST_UPDATE_FILE, content, "utf8");
  }

  async function updateReadmeLastUpdate(
    patch: string,
    date: string
  ): Promise<void> {
    let readme = "";
    try {
      readme = await fs.readFile(README_MD, "utf8");
    } catch {
      // If no README exists, create a minimal one
      const minimal = `# d2pt-grid-updater\n\n**Last update**: ${date} • Patch ${patch} — see [grids.md](./grids.md)\n`;
      await fs.writeFile(README_MD, minimal, "utf8");
      return;
    }
    const lines = readme.split(/\r?\n/);
    const lastUpdateLine = `**Last update**: ${date} • Patch ${patch} — see [grids.md](./grids.md)`;
    // Replace existing or insert after H1
    let replaced = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\*{0,2}Last update\*{0,2}\s*:/i.test(lines[i] ?? "")) {
        lines[i] = lastUpdateLine;
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      let titleIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^#\s+/.test(lines[i] ?? "")) {
          titleIndex = i;
          break;
        }
      }
      if (titleIndex !== -1) {
        lines.splice(titleIndex + 1, 0, "", lastUpdateLine);
      } else {
        lines.push("", lastUpdateLine);
      }
    }
    await fs.writeFile(README_MD, lines.join("\n"), "utf8");
  }

  // Ensure README has a last update line; if missing, insert it. Does not replace existing.
  async function ensureReadmeHasLastUpdate(
    patch: string,
    date: string
  ): Promise<void> {
    let readme = "";
    try {
      readme = await fs.readFile(README_MD, "utf8");
    } catch {
      // Create minimal README if not present
      const minimal = `# d2pt-grid-updater\n\n**Last update**: ${date} • Patch ${patch} — see [grids.md](./grids.md)\n`;
      await fs.writeFile(README_MD, minimal, "utf8");
      return;
    }
    if (/^\*{0,2}Last update\*{0,2}\s*:/im.test(readme)) {
      return; // already present, do nothing
    }
    const lines = readme.split(/\r?\n/);
    const lastUpdateLine = `**Last update**: ${date} • Patch ${patch} — see [grids.md](./grids.md)`;
    // Insert after H1 if available, else append
    let titleIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#\s+/.test(lines[i] ?? "")) {
        titleIndex = i;
        break;
      }
    }
    if (titleIndex !== -1) {
      lines.splice(titleIndex + 1, 0, "", lastUpdateLine);
    } else {
      lines.push("", lastUpdateLine);
    }
    await fs.writeFile(README_MD, lines.join("\n"), "utf8");
  }

  // Determine last recorded update: prefer last_update.txt
  const lastRecorded = await readLastUpdateFile();
  const is_same = !!(
    lastRecorded &&
    lastRecorded.date === dateStr &&
    (lastRecorded.patch === rawPatch || lastRecorded.patch === patchStr)
  );
  const entry_exists = hasEntryInMd(mdContent, dateStr, rawPatch, patchStr);
  if (!force && entry_exists) {
    if (is_same) {
      console.log(
        `No update and entry already present: ${dateStr} ${patchStr}. Skipping downloads and updates.`
      );
      // Ensure README has the last update line at least once
      if (lastRecorded?.patch && lastRecorded?.date) {
        await ensureReadmeHasLastUpdate(lastRecorded.patch, lastRecorded.date);
      } else {
        await ensureReadmeHasLastUpdate(rawPatch, dateStr);
      }
    } else {
      console.log(
        `Entry present in grids.md but last_update.txt/README outdated or missing. Updating metadata and skipping downloads.`
      );
      await writeLastUpdateFile(rawPatch, dateStr);
      await updateReadmeLastUpdate(rawPatch, dateStr);
    }
    await browser.close();
    return;
  }

  // Find all 'Download' buttons inside the parent div
  const downloadButtons = await parentDiv.locator(
    'button:has-text("Download")'
  );
  const buttonCount = await downloadButtons.count();
  if (buttonCount < 3) {
    console.error(`Expected 3 download buttons, found ${buttonCount}`);
    await browser.close();
    return;
  }

  const savedFiles: string[] = [];
  await fs.mkdir(GRIDS_STORE_FOLDER, { recursive: true });
  for (let i = 0; i < 3; i++) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButtons.nth(i).click(),
    ]);
    const suggestedFilename = download
      .suggestedFilename()
      .replace(/\.json$/, "");
    const savePath = `${GRIDS_STORE_FOLDER}/${suggestedFilename}_${dateStr}_${patchStr}.json`;
    await download.saveAs(savePath);
    console.log(`Downloaded file saved as ${savePath}`);
    savedFiles.push(path.basename(savePath));
  }

  if (force && (is_same || entry_exists)) {
    // Sync README using repair-like logic (prefer grids.md row, then site scrape)
    const mdRow = parseFirstRowFromMd(mdContent);
    const patchForSync =
      mdRow?.patch || (rawPatch !== "unknown_patch_raw" ? rawPatch : undefined);
    const dateForSync =
      mdRow?.date || (dateStr !== "unknown_date" ? dateStr : undefined);
    if (patchForSync && dateForSync) {
      await updateReadmeLastUpdate(patchForSync, dateForSync);
      console.log(
        `Forced re-download completed; synced README with ${
          mdRow ? "grids.md" : "site scrape"
        }: ${dateForSync} • Patch ${patchForSync}`
      );
    } else {
      console.log(
        "Forced re-download completed; could not determine date/patch to sync README."
      );
    }
    await browser.close();
    return;
  }

  // Update grids.md: insert new row only if it's missing; do not edit header
  const linkFile = (fname?: string) =>
    fname ? `[🔗 Download](grids/${fname})` : "";
  const newRow = `| ${dateStr} | ${rawPatch} | ${linkFile(
    savedFiles[0]
  )} | ${linkFile(savedFiles[1])} | ${linkFile(savedFiles[2])} |`;
  let wroteMd = false;
  if (!entry_exists) {
    let newMd = mdContent;
    if (!mdContent) {
      newMd = `| Date | Patch | D2PT Rating | High Winrate | Most Played |\n| ---- | ----- | ----------- | ------------ | ----------- |\n${newRow}\n`;
    } else {
      const lines = mdContent.split(/\r?\n/);
      let sepIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i] ?? "";
        if (/^\|?\s*-{2,}/.test(ln.replace(/\|/g, " "))) {
          sepIndex = i;
          break;
        }
      }
      if (sepIndex === -1) {
        newMd =
          lines.join("\n") +
          `\n\n| Date | Patch | D2PT Rating | High Winrate | Most Played |\n| ---- | ----- | ----------- | ------------ | ----------- |\n${newRow}\n`;
      } else {
        lines.splice(sepIndex + 1, 0, newRow);
        newMd = lines.join("\n");
      }
    }
    await fs.writeFile(GRIDS_MD, newMd, "utf8");
    wroteMd = true;
    console.log(`Updated ${GRIDS_MD} with new entry.`);
  } else {
    console.log(
      `Entry already present in ${GRIDS_MD}; not adding a duplicate row.`
    );
  }

  // Update metadata (last_update.txt and README.md) only if we added a new entry
  if (wroteMd) {
    await writeLastUpdateFile(rawPatch, dateStr);
    await updateReadmeLastUpdate(rawPatch, dateStr);
    console.log(`Updated ${LAST_UPDATE_FILE} and README.md.`);
  }
  await browser.close();
}

main();
