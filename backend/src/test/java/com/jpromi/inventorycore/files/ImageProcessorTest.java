package com.jpromi.inventorycore.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

class ImageProcessorTest {

    @Test
    void scalesLargePhotoDownToJpeg() throws Exception {
        BufferedImage image = ImageProcessor.read(encode(new BufferedImage(4000, 3000, BufferedImage.TYPE_INT_RGB), "jpeg"));
        assertNotNull(image);

        ImageProcessor.Encoded content = ImageProcessor.encode(image, 1920);
        assertEquals("image/jpeg", content.contentType());
        assertEquals(1920, content.width());
        assertEquals(1440, content.height());

        ImageProcessor.Encoded thumbnail = ImageProcessor.encode(image, 400);
        assertEquals(400, thumbnail.width());
        assertEquals(300, thumbnail.height());
    }

    @Test
    void neverEnlargesAndKeepsTransparency() throws Exception {
        BufferedImage image = ImageProcessor.read(encode(new BufferedImage(120, 80, BufferedImage.TYPE_INT_ARGB), "png"));
        ImageProcessor.Encoded content = ImageProcessor.encode(image, 1920);
        assertEquals("image/png", content.contentType());
        assertEquals(120, content.width());
        assertEquals(80, content.height());
    }

    @Test
    void rejectsNonImages() {
        assertNull(ImageProcessor.read("<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes()));
    }

    @Test
    void webpReaderIsRegistered() {
        assertTrue(ImageIO.getImageReadersByMIMEType("image/webp").hasNext());
    }

    private static byte[] encode(BufferedImage image, String format) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);
        return out.toByteArray();
    }
}
