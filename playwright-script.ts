import { chromium } from "playwright";

const GRIDS_STORE_FOLDER = "./grids";

async function main() {
  const browser = await chromium.launch({ headless: false });
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
    return;
  }
  // Find the element with the last update and patch info
  const updateInfo = await metaParentDiv
    .locator(":scope >> text=/Last update:/")
    .first();
  let dateStr = "unknown_date";
  let patchStr = "unknown_patch";
  if ((await updateInfo.count()) > 0) {
    const updateText = await updateInfo.textContent();
    // Example: 'Last update: Oct 12, 2025 • Patch 7.39d'
    const match = updateText?.match(/Last update: ([^•]+) • Patch ([^\s]+)/);
    if (match) {
      // Format date to YYYY-MM-DD
      const rawDate = match[1].trim();
      const patch = match[2].trim();
      const dateObj = new Date(rawDate);
      if (!isNaN(dateObj.getTime())) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getDate()).padStart(2, "0");
        dateStr = `${yyyy}-${mm}-${dd}`;
      }
      // Patch: 7.39d -> p7_39d
      patchStr = "p" + patch.replace(/\./g, "_");
    }
  }

  // Find the parent div containing the text 'Download Hero Grid Configuration'
  const parentDiv = await page
    .locator('div:has-text("Download Hero Grid Configuration")')
    .first();
  if ((await parentDiv.count()) === 0) {
    console.error("Parent div with the specified text not found.");
    return;
  }
  console.log("Parent div found.");

  // Find all 'Download' buttons inside the parent div
  const downloadButtons = await parentDiv.locator(
    'button:has-text("Download")'
  );
  const buttonCount = await downloadButtons.count();
  if (buttonCount < 3) {
    console.error(`Expected 3 download buttons, found ${buttonCount}`);
    return;
  }

  for (let i = 0; i < 3; i++) {
    // Wait for the download event
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
  }
  await browser.close();
}

main();
