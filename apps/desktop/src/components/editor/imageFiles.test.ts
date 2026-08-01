import { describe, expect, it } from "vitest";
import { imageFileValidationError, MAX_IMAGE_FILE_BYTES } from "./imageFiles";

describe("image file validation", () => {
  it("accepts non-empty image files within the import limit", () => {
    expect(imageFileValidationError({ type: "image/png", size: 1024 })).toBeUndefined();
  });

  it("rejects non-image, empty, and oversized files with actionable errors", () => {
    expect(imageFileValidationError({ type: "text/plain", size: 10 })).toBe("Choose an image file.");
    expect(imageFileValidationError({ type: "image/png", size: 0 })).toBe("The selected image is empty.");
    expect(imageFileValidationError({ type: "image/png", size: MAX_IMAGE_FILE_BYTES + 1 })).toBe(
      "Images must be 25 MB or smaller.",
    );
  });
});
