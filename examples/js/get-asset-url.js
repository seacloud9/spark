export async function getAssetFileURL(assetFile) {
  try {
    const response = await fetch("../assets.json");
    const assetsDirectory = "/examples/assets/";
    const fixtureAssets = new Set([
      "butterfly-ai.spz",
      "butterfly.spz",
      "cat.spz",
      "distant-igloo.spz",
      "fireplace.spz",
      "fly.spz",
      "penguin.spz",
      "robot-head.spz",
      "rubberduck.glb",
      "valley.spz",
    ]);
    const assetsInfo = await response.json();
    let url = assetsInfo[assetFile].url;
    const useFixtureAssets =
      new URLSearchParams(window.location.search).get("testFixtureAssets") ===
      "1";
    if (useFixtureAssets && fixtureAssets.has(assetFile)) {
      const prefix = assetFile.endsWith(".glb") ? "models/" : "";
      return `/test/fixtures/assets/${prefix}${assetFile}`;
    }
    if (window.sparkLocalAssets) {
      url = `${assetsDirectory}${assetsInfo[assetFile].directory}/${assetFile}`;
    }
    return url;
  } catch (error) {
    console.error("Failed to load asset file URL:", error);
    return null;
  }
}
