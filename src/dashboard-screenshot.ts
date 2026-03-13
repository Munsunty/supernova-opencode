/**
 * Dashboard Screenshot 유틸 (POC)
 *
 * headless Chromium으로 Dashboard 페이지를 스크린샷.
 * 외부에서 함수로 호출하거나, CLI로 직접 실행 가능.
 *
 * @example
 * ```ts
 * import { captureDashboard } from "./.devserver/src/dashboard-screenshot"
 * const png = await captureDashboard()
 * ```
 *
 * @example CLI
 * ```bash
 * bun run .devserver/src/dashboard-screenshot.ts
 * bun run .devserver/src/dashboard-screenshot.ts --url http://127.0.0.1:51234 --output ./shot.png
 * ```
 */

import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEVSERVER_DIR = dirname(new URL(import.meta.url).pathname);
const SCREENSHOTS_DIR = resolve(DEVSERVER_DIR, "..", "screenshots");

export interface ScreenshotOptions {
    url?: string;
    outputPath?: string;
    viewport?: { width: number; height: number };
    waitFor?: number;
    fullPage?: boolean;
}

export async function captureDashboard(
    options: ScreenshotOptions = {},
): Promise<Buffer> {
    const {
        url = "http://127.0.0.1:51234",
        outputPath,
        viewport = { width: 1280, height: 800 },
        waitFor = 2000,
        fullPage = true,
    } = options;

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: "/usr/bin/chromium-browser",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

        if (waitFor > 0) {
            await new Promise((r) => setTimeout(r, waitFor));
        }

        const buffer = (await page.screenshot({
            type: "png",
            fullPage,
        })) as Buffer;

        if (outputPath) {
            const absPath = resolve(outputPath);
            await mkdir(dirname(absPath), { recursive: true });
            await writeFile(absPath, buffer);
        }

        return buffer;
    } finally {
        await browser.close();
    }
}

// ─── CLI 실행 ──────────────────────────────────────────────────

if (import.meta.main) {
    const args = process.argv.slice(2);
    const getArg = (flag: string) => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
    };

    const url = getArg("--url") ?? "http://127.0.0.1:51234";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const output =
        getArg("--output") ??
        resolve(SCREENSHOTS_DIR, `dashboard-${timestamp}.png`);

    console.log(`Capturing: ${url}`);
    console.log(`Output:    ${output}`);

    const buffer = await captureDashboard({ url, outputPath: output });
    console.log(`Done. ${(buffer.length / 1024).toFixed(1)}KB`);
}
