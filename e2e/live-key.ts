import { execFileSync } from "node:child_process";

/**
 * The real Garmin key for the specs that run only with GARMIN_LIVE=1: GARMIN_PERSONAL_API_KEY, or the macOS Keychain
 * (service garmin-personal-api). Never printed. Call it only behind that gate: nothing else may read the Keychain.
 */
export function liveKey(): string {
    const fromEnv = process.env.GARMIN_PERSONAL_API_KEY?.trim();
    if (fromEnv) return fromEnv;
    return execFileSync("/usr/bin/security", ["find-generic-password", "-s", "garmin-personal-api", "-w"]).toString().trim();
}
