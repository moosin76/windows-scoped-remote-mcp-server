#!/usr/bin/env python3
"""Measure a rendered/model silhouette with OpenCV.

Designed for Blender/Windows MCP visual validation loops. The image should
preferably have a simple, mostly uniform background. Alpha is used when present;
otherwise the foreground is estimated from color distance to the image corners.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def build_mask(image: np.ndarray, threshold: float) -> np.ndarray:
    if image.ndim == 3 and image.shape[2] == 4:
        alpha = image[:, :, 3]
        if int(alpha.max()) > int(alpha.min()):
            _, mask = cv2.threshold(alpha, 8, 255, cv2.THRESH_BINARY)
            return mask

    bgr = image[:, :, :3].astype(np.float32)
    h, w = bgr.shape[:2]
    patch = max(4, min(h, w) // 40)
    corners = np.concatenate(
        [
            bgr[:patch, :patch].reshape(-1, 3),
            bgr[:patch, -patch:].reshape(-1, 3),
            bgr[-patch:, :patch].reshape(-1, 3),
            bgr[-patch:, -patch:].reshape(-1, 3),
        ],
        axis=0,
    )
    background = np.median(corners, axis=0)
    distance = np.linalg.norm(bgr - background[None, None, :], axis=2)
    mask = (distance >= threshold).astype(np.uint8) * 255
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return mask


def largest_component(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise RuntimeError("no foreground contour found")
    contour = max(contours, key=cv2.contourArea)
    component = np.zeros_like(mask)
    cv2.drawContours(component, [contour], -1, 255, thickness=cv2.FILLED)
    return contour, component


def analyze(image_path: Path, threshold: float, mask_output: Path | None) -> dict:
    image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise RuntimeError(f"failed to read image: {image_path}")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    raw_mask = build_mask(image, threshold)
    contour, mask = largest_component(raw_mask)
    x, y, w, h = cv2.boundingRect(contour)
    area = float(cv2.contourArea(contour))
    moments = cv2.moments(contour)
    cx = float(moments["m10"] / moments["m00"]) if moments["m00"] else x + w / 2.0
    cy = float(moments["m01"] / moments["m00"]) if moments["m00"] else y + h / 2.0

    crop = mask[y : y + h, x : x + w] > 0
    flipped = np.fliplr(crop)
    intersection = int(np.logical_and(crop, flipped).sum())
    union = int(np.logical_or(crop, flipped).sum())
    symmetry_iou = float(intersection / union) if union else 1.0

    image_h, image_w = mask.shape
    result = {
        "image": str(image_path),
        "imageWidthPx": int(image_w),
        "imageHeightPx": int(image_h),
        "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
        "bboxWidthRatio": float(w / image_w),
        "bboxHeightRatio": float(h / image_h),
        "bboxAspectWidthOverHeight": float(w / h) if h else 0.0,
        "contourAreaPx": area,
        "foregroundAreaRatio": float((mask > 0).sum() / (image_w * image_h)),
        "centroidPx": {"x": cx, "y": cy},
        "horizontalSymmetryIoU": symmetry_iou,
    }

    if mask_output is not None:
        mask_output.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(mask_output), mask):
            raise RuntimeError(f"failed to write mask: {mask_output}")
        result["mask"] = str(mask_output)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--threshold", type=float, default=28.0)
    parser.add_argument("--mask-output", type=Path)
    args = parser.parse_args()
    print(json.dumps(analyze(args.image, args.threshold, args.mask_output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
