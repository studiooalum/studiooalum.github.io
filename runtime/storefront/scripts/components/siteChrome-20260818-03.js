import { initSiteChrome as initExistingSiteChrome } from "./siteChrome-20260818-02.js";
import { initProgressiveImages } from "./progressive-images-20260818-01.js";

export function initSiteChrome(options) {
  initProgressiveImages();
  initExistingSiteChrome(options);
}