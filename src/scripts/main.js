import { initThreadScene } from "./canvas/threadScene.js";
import { isMobile } from "./utils/device.js";

initThreadScene({
  mobile: isMobile()
});
