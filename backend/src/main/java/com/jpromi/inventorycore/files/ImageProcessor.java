package com.jpromi.inventorycore.files;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;

/**
 * Decodes uploaded images, applies the EXIF orientation (phone photos are often stored
 * sideways), scales them down and encodes them again. Images without transparency become
 * JPEG, images with transparency PNG.
 *
 * <p>WebP and CMYK JPEGs are readable through the TwelveMonkeys ImageIO plugins.
 */
public final class ImageProcessor {

    private static final float JPEG_QUALITY = 0.85f;

    /** One encoded image. */
    public record Encoded(byte[] data, String contentType, int width, int height) {}

    private ImageProcessor() {
    }

    /** Reads the image; null if the bytes are no image ImageIO can decode. */
    public static BufferedImage read(byte[] data) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(data));
            return image == null ? null : orient(image, orientation(data));
        } catch (IOException | RuntimeException exception) {
            return null;
        }
    }

    /** Scales the image so that neither side exceeds {@code maxSize} (never enlarges) and encodes it. */
    public static Encoded encode(BufferedImage image, int maxSize) throws IOException {
        BufferedImage scaled = scale(image, maxSize);
        boolean alpha = scaled.getColorModel().hasAlpha();
        if (alpha) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(scaled, "png", out);
            return new Encoded(out.toByteArray(), "image/png", scaled.getWidth(), scaled.getHeight());
        }
        return new Encoded(jpeg(scaled), "image/jpeg", scaled.getWidth(), scaled.getHeight());
    }

    private static BufferedImage scale(BufferedImage image, int maxSize) {
        int width = image.getWidth();
        int height = image.getHeight();
        double factor = Math.min(1d, (double) maxSize / Math.max(width, height));
        int targetWidth = Math.max(1, (int) Math.round(width * factor));
        int targetHeight = Math.max(1, (int) Math.round(height * factor));

        boolean alpha = image.getColorModel().hasAlpha();
        int type = alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage current = image;
        // halve in steps: a single bilinear step from a large photo looks grainy
        do {
            width = Math.max(targetWidth, width / 2);
            height = Math.max(targetHeight, height / 2);
            if (factor == 1d) {
                width = targetWidth;
                height = targetHeight;
            }
            BufferedImage next = new BufferedImage(width, height, type);
            Graphics2D graphics = next.createGraphics();
            if (!alpha) {
                // white background for formats with palette transparency (e.g. GIF) that end up as JPEG
                graphics.setColor(java.awt.Color.WHITE);
                graphics.fillRect(0, 0, width, height);
            }
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(current, 0, 0, width, height, null);
            graphics.dispose();
            current = next;
        } while (width != targetWidth || height != targetHeight);
        return current;
    }

    private static byte[] jpeg(BufferedImage image) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        ImageWriter writer = writers.next();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(stream);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    /** EXIF orientation 1-8, 1 if unknown. */
    private static int orientation(byte[] data) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(data));
            ExifIFD0Directory directory = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (directory != null && directory.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
                return directory.getInt(ExifIFD0Directory.TAG_ORIENTATION);
            }
        } catch (Exception exception) {
            // no or unreadable metadata: keep the image as it is
        }
        return 1;
    }

    private static BufferedImage orient(BufferedImage image, int orientation) {
        if (orientation <= 1 || orientation > 8) {
            return image;
        }
        int width = image.getWidth();
        int height = image.getHeight();
        boolean swap = orientation >= 5;
        AffineTransform transform = new AffineTransform();
        switch (orientation) {
            case 2 -> { transform.translate(width, 0); transform.scale(-1, 1); }
            case 3 -> { transform.translate(width, height); transform.rotate(Math.PI); }
            case 4 -> { transform.translate(0, height); transform.scale(1, -1); }
            case 5 -> { transform.rotate(-Math.PI / 2); transform.scale(-1, 1); }
            case 6 -> { transform.translate(height, 0); transform.rotate(Math.PI / 2); }
            case 7 -> { transform.translate(height, width); transform.scale(1, -1); transform.rotate(Math.PI / 2); }
            case 8 -> { transform.translate(0, width); transform.rotate(3 * Math.PI / 2); }
            default -> { }
        }
        int type = image.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage result = new BufferedImage(swap ? height : width, swap ? width : height, type);
        Graphics2D graphics = result.createGraphics();
        graphics.drawImage(image, transform, null);
        graphics.dispose();
        return result;
    }
}
