// Images are bundled into main.js as data URLs by esbuild (the `.png` loader in opdk.config.mjs): an Obsidian release ships only
// main.js, manifest.json and styles.css, so a file next to the plugin would never reach the user.
declare module "*.png" {
  const dataUrl: string;
  export default dataUrl;
}
