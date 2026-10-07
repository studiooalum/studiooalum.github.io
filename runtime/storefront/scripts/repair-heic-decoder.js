// heic-to 1.6.5 (LGPL-3.0); license and source information: /public/licenses/heic-to.txt
import { heicTo } from "heic-to";

export function decodeHeicPhoto(blob) {
  return heicTo({ blob, type: "bitmap" });
}
