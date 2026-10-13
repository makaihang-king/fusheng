package com.cocos.game;

import android.content.Context;
import android.graphics.ImageFormat;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.SystemClock;
import android.system.Os;
import android.util.Log;

import com.cocos.lib.CocosHelper;
import com.cocos.lib.CocosJavascriptJavaBridge;
import com.cocos.lib.GlobalObject;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.regex.Pattern;

/** Encodes the game's top-down 480 x 270 RGBA snapshots into a real H.264 MP4. */
public final class MomentCodec {
    private static final String TAG = "FleetingMomentCodec";
    private static final String MIME = "video/avc";
    private static final String DIRECTORY = "fleeting-life-moments-v2";
    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_-]{1,80}");
    private static final int WIDTH = 480;
    private static final int HEIGHT = 270;
    private static final int FRAME_BYTES = WIDTH * HEIGHT * 4;
    private static final int QUEUE_LIMIT = 8;
    private static final int BIT_RATE = 850_000;
    private static final long CODEC_WAIT_US = 10_000L;
    private static final long STALL_TIMEOUT_MS = 10_000L;
    private static final int[] INPUT_COLORS = {
        MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible,
        MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar,
        MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
    };
    private static final Object ACTIVE_LOCK = new Object();
    private static Session active;

    private MomentCodec() {}

    /** Called through Cocos native.reflection; initialization happens on the worker. */
    public static boolean begin(String id, int width, int height, int fps) {
        if (id == null || !SAFE_ID.matcher(id).matches() || width != WIDTH || height != HEIGHT
                || fps < 1 || fps > 30) {
            return false;
        }
        Context context = GlobalObject.getContext();
        if (context == null) {
            return false;
        }

        synchronized (ACTIVE_LOCK) {
            if (active != null) {
                return false;
            }
            try {
                File directory = new File(context.getFilesDir(), DIRECTORY);
                if (!directory.isDirectory() && !directory.mkdirs()) {
                    return false;
                }
                File destination = new File(directory, id + ".mp4");
                if (destination.exists()) {
                    return false;
                }
                Session session = new Session(id, fps, destination);
                active = session;
                session.start();
                return true;
            } catch (Throwable error) {
                active = null;
                Log.e(TAG, "Could not start MP4 encoder", error);
                return false;
            }
        }
    }

    /** Called by the JSB bridge. The byte array is retained only in a bounded queue. */
    public static boolean enqueueRgba(String id, byte[] pixels, long ptsUs) {
        Session session;
        synchronized (ACTIVE_LOCK) {
            session = active;
        }
        return session != null && session.id.equals(id) && session.offer(pixels, ptsUs);
    }

    public static void finish(String id) {
        Session session;
        synchronized (ACTIVE_LOCK) {
            session = active;
        }
        if (session != null && session.id.equals(id)) {
            session.finish();
        }
    }

    public static void cancel(String id) {
        Session session;
        synchronized (ACTIVE_LOCK) {
            session = active;
            if (session != null && session.id.equals(id)) {
                active = null;
            } else {
                session = null;
            }
        }
        if (session != null) {
            session.cancel();
        }
    }

    /** Remove unfinished muxer files left by an earlier process at activity startup. */
    static void cleanupStaleParts(File filesDir) {
        if (filesDir == null) {
            return;
        }
        synchronized (ACTIVE_LOCK) {
            if (active != null) {
                return;
            }
            File directory = new File(filesDir, DIRECTORY);
            File[] entries = directory.listFiles();
            if (entries == null) {
                return;
            }
            for (File entry : entries) {
                String name = entry.getName();
                if (entry.isFile() && name.endsWith(".mp4.part")
                        && SAFE_ID.matcher(name.substring(0, name.length() - 9)).matches()
                        && !entry.delete()) {
                    Log.w(TAG, "Could not remove unfinished MP4: " + entry);
                }
            }
        }
    }

    private static final class Frame {
        final byte[] rgba;
        final long ptsUs;

        Frame(byte[] rgba, long ptsUs) {
            this.rgba = rgba;
            this.ptsUs = ptsUs;
        }
    }

    private static final class PreparedEncoder {
        final MediaCodec codec;
        final int color;
        final int encodedHeight;
        final int inputStride;
        final int inputSliceHeight;
        final int inputSize;
        int firstInputIndex;
        Image firstInputImage;

        PreparedEncoder(MediaCodec codec, int color, int encodedHeight,
                        int inputStride, int inputSliceHeight,
                        int firstInputIndex, Image firstInputImage) {
            this.codec = codec;
            this.color = color;
            this.encodedHeight = encodedHeight;
            this.inputStride = inputStride;
            this.inputSliceHeight = inputSliceHeight;
            this.inputSize = inputStride * inputSliceHeight * 3 / 2;
            this.firstInputIndex = firstInputIndex;
            this.firstInputImage = firstInputImage;
        }

        void closeFirstImage() {
            if (firstInputImage != null) {
                firstInputImage.close();
                firstInputImage = null;
            }
        }
    }

    private static final class Cancelled extends Exception {
        Cancelled() {
            super("cancelled");
        }
    }

    private static final class Session implements Runnable {
        final String id;
        final int fps;
        final File destination;
        final File part;
        final Object lock = new Object();
        final ArrayDeque<Frame> frames = new ArrayDeque<>();

        boolean finishRequested;
        boolean cancelled;
        boolean committed;
        long lastAcceptedPtsUs = -1L;
        long firstInputPtsUs = -1L;
        long lastInputPtsUs = -1L;
        long lastMuxedPtsUs = -1L;
        int outputSamples;
        int trackIndex = -1;
        boolean muxerStarted;
        PreparedEncoder prepared;
        MediaMuxer muxer;

        Session(String id, int fps, File destination) {
            this.id = id;
            this.fps = fps;
            this.destination = destination;
            this.part = new File(destination.getParentFile(), destination.getName() + ".part");
        }

        void start() {
            new Thread(this, "MomentCodec-" + id).start();
        }

        boolean offer(byte[] rgba, long ptsUs) {
            if (rgba == null || rgba.length != FRAME_BYTES || ptsUs < 0L) {
                return false;
            }
            synchronized (lock) {
                if (cancelled || finishRequested || frames.size() >= QUEUE_LIMIT
                        || lastAcceptedPtsUs == Long.MAX_VALUE) {
                    return false;
                }
                long monotonicPtsUs = Math.max(ptsUs, lastAcceptedPtsUs + 1L);
                frames.addLast(new Frame(rgba, monotonicPtsUs));
                lastAcceptedPtsUs = monotonicPtsUs;
                lock.notifyAll();
                return true;
            }
        }

        void finish() {
            synchronized (lock) {
                finishRequested = true;
                lock.notifyAll();
            }
        }

        void cancel() {
            synchronized (lock) {
                cancelled = true;
                frames.clear();
                if (committed && !destination.delete()) {
                    Log.w(TAG, "Could not remove cancelled MP4: " + destination);
                }
                lock.notifyAll();
            }
        }

        private void checkCancelled() throws Cancelled {
            synchronized (lock) {
                if (cancelled) {
                    throw new Cancelled();
                }
            }
        }

        private Frame takeFrame() throws InterruptedException, Cancelled {
            synchronized (lock) {
                while (frames.isEmpty() && !finishRequested && !cancelled) {
                    lock.wait();
                }
                if (cancelled) {
                    throw new Cancelled();
                }
                return frames.pollFirst();
            }
        }

        @Override
        public void run() {
            boolean ok = false;
            String errorText = "";
            long durationMs = 0L;
            try {
                checkCancelled();
                if (part.exists() && !part.delete()) {
                    throw new IOException("Could not replace stale partial video");
                }
                prepared = prepareEncoder();
                checkCancelled();
                muxer = new MediaMuxer(part.getAbsolutePath(),
                        MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);

                Frame frame;
                while ((frame = takeFrame()) != null) {
                    encode(frame);
                    checkCancelled();
                }
                if (firstInputPtsUs < 0L) {
                    throw new IOException("No video frames were submitted");
                }
                queueEndOfStream();
                drain(true);
                if (!muxerStarted || outputSamples == 0) {
                    throw new IOException("Encoder produced no video samples");
                }

                prepared.closeFirstImage();
                prepared.codec.stop();
                prepared.codec.release();
                prepared = null;
                muxer.stop();
                muxer.release();
                muxer = null;

                if (part.length() <= 0L) {
                    throw new IOException("MP4 file is empty");
                }
                synchronized (lock) {
                    if (cancelled) {
                        throw new Cancelled();
                    }
                    if (destination.exists()) {
                        throw new IOException("MP4 destination already exists");
                    }
                    // Source and destination share a directory; POSIX rename is atomic.
                    Os.rename(part.getAbsolutePath(), destination.getAbsolutePath());
                    committed = true;
                }
                durationMs = Math.max(100L,
                        (lastMuxedPtsUs - firstInputPtsUs) / 1000L + 1000L / fps);
                ok = true;
            } catch (Cancelled error) {
                errorText = error.getMessage();
            } catch (Throwable error) {
                errorText = error.getClass().getSimpleName() + ": " + error.getMessage();
                Log.e(TAG, "MP4 encoding failed for " + id, error);
            } finally {
                if (prepared != null) {
                    prepared.closeFirstImage();
                    try {
                        prepared.codec.stop();
                    } catch (Throwable ignored) {}
                    try {
                        prepared.codec.release();
                    } catch (Throwable ignored) {}
                    prepared = null;
                }
                if (muxer != null) {
                    if (muxerStarted) {
                        try {
                            muxer.stop();
                        } catch (Throwable ignored) {}
                    }
                    try {
                        muxer.release();
                    } catch (Throwable ignored) {}
                    muxer = null;
                }
                synchronized (lock) {
                    if (cancelled) {
                        ok = false;
                        errorText = "cancelled";
                    }
                }
                if (!ok && committed && destination.exists() && !destination.delete()) {
                    Log.w(TAG, "Could not remove failed MP4: " + destination);
                }
                if (!ok && part.exists() && !part.delete()) {
                    Log.w(TAG, "Could not remove partial MP4: " + part);
                }
                synchronized (ACTIVE_LOCK) {
                    if (active == this) {
                        active = null;
                    }
                }
                notifyEncoded(id, ok, ok ? destination.getAbsolutePath() : "",
                        ok ? durationMs : 0L, errorText);
            }
        }

        private PreparedEncoder prepareEncoder() throws IOException, Cancelled {
            int paddedHeight = (HEIGHT + 15) & ~15;
            int[] heights = HEIGHT == paddedHeight
                    ? new int[]{HEIGHT} : new int[]{HEIGHT, paddedHeight};
            MediaCodecInfo[] codecs = new MediaCodecList(MediaCodecList.REGULAR_CODECS)
                    .getCodecInfos();
            for (MediaCodecInfo info : codecs) {
                checkCancelled();
                if (!info.isEncoder() || !supportsMime(info)) {
                    continue;
                }
                MediaCodecInfo.CodecCapabilities capabilities;
                try {
                    capabilities = info.getCapabilitiesForType(MIME);
                } catch (Throwable error) {
                    continue;
                }
                for (int encodedHeight : heights) {
                    if (!capabilities.getVideoCapabilities().isSizeSupported(WIDTH, encodedHeight)) {
                        continue;
                    }
                    for (int color : INPUT_COLORS) {
                        if (!supportsColor(capabilities.colorFormats, color)) {
                            continue;
                        }
                        MediaCodec codec = null;
                        Image inputImage = null;
                        boolean started = false;
                        try {
                            codec = MediaCodec.createByCodecName(info.getName());
                            MediaFormat format = MediaFormat.createVideoFormat(MIME, WIDTH, encodedHeight);
                            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, color);
                            format.setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE);
                            format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
                            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
                            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                            codec.start();
                            started = true;
                            int inputIndex = codec.dequeueInputBuffer(100_000L);
                            if (inputIndex < 0) {
                                throw new IOException("Encoder did not provide an input buffer");
                            }
                            if (color == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible) {
                                inputImage = codec.getInputImage(inputIndex);
                                if (inputImage == null || inputImage.getFormat() != ImageFormat.YUV_420_888) {
                                    throw new IOException("Flexible YUV input image is unavailable");
                                }
                            }
                            int inputStride = WIDTH;
                            int inputSliceHeight = encodedHeight;
                            if (inputImage == null) {
                                MediaFormat inputFormat = codec.getInputFormat();
                                if (inputFormat.containsKey(MediaFormat.KEY_STRIDE)) {
                                    inputStride = Math.max(WIDTH,
                                            inputFormat.getInteger(MediaFormat.KEY_STRIDE));
                                }
                                if (inputFormat.containsKey(MediaFormat.KEY_SLICE_HEIGHT)) {
                                    inputSliceHeight = Math.max(encodedHeight,
                                            inputFormat.getInteger(MediaFormat.KEY_SLICE_HEIGHT));
                                }
                                if ((inputStride & 1) != 0 || (inputSliceHeight & 1) != 0
                                        || (long) inputStride * inputSliceHeight * 3L / 2L
                                        > Integer.MAX_VALUE) {
                                    throw new IOException("Unsupported packed YUV stride");
                                }
                                ByteBuffer inputBuffer = codec.getInputBuffer(inputIndex);
                                if (inputBuffer == null || inputBuffer.capacity()
                                        < inputStride * inputSliceHeight * 3 / 2) {
                                    throw new IOException("Packed YUV input buffer is too small");
                                }
                            }
                            Log.i(TAG, "Using " + info.getName() + " " + WIDTH + "x"
                                    + encodedHeight + " color=" + color);
                            return new PreparedEncoder(codec, color, encodedHeight,
                                    inputStride, inputSliceHeight, inputIndex, inputImage);
                        } catch (Throwable error) {
                            Log.w(TAG, "Encoder candidate failed: " + info.getName() + " "
                                    + WIDTH + "x" + encodedHeight + " color=" + color, error);
                            if (inputImage != null) {
                                inputImage.close();
                            }
                            if (codec != null) {
                                if (started) {
                                    try {
                                        codec.stop();
                                    } catch (Throwable ignored) {}
                                }
                                try {
                                    codec.release();
                                } catch (Throwable ignored) {}
                            }
                        }
                    }
                }
            }
            throw new IOException("No compatible H.264 YUV420 encoder");
        }

        private void encode(Frame frame) throws IOException, Cancelled {
            int index = inputIndex();
            int size = prepared.inputSize;
            if (prepared.color == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible) {
                Image image = prepared.firstInputImage;
                prepared.firstInputImage = null;
                if (image == null) {
                    image = prepared.codec.getInputImage(index);
                }
                if (image == null) {
                    throw new IOException("Encoder lost its YUV input image");
                }
                try {
                    writeFlexible(frame.rgba, image, prepared.encodedHeight);
                } finally {
                    image.close();
                }
            } else {
                ByteBuffer buffer = prepared.codec.getInputBuffer(index);
                if (buffer == null || buffer.capacity() < size) {
                    throw new IOException("Encoder input buffer is too small");
                }
                writePacked(frame.rgba, buffer, prepared.color, prepared.encodedHeight,
                        prepared.inputStride, prepared.inputSliceHeight);
            }
            prepared.codec.queueInputBuffer(index, 0, size, frame.ptsUs, 0);
            if (firstInputPtsUs < 0L) {
                firstInputPtsUs = frame.ptsUs;
            }
            lastInputPtsUs = frame.ptsUs;
            drain(false);
        }

        private int inputIndex() throws IOException, Cancelled {
            if (prepared.firstInputIndex >= 0) {
                int index = prepared.firstInputIndex;
                prepared.firstInputIndex = -1;
                return index;
            }
            long deadline = SystemClock.elapsedRealtime() + STALL_TIMEOUT_MS;
            while (SystemClock.elapsedRealtime() < deadline) {
                checkCancelled();
                int index = prepared.codec.dequeueInputBuffer(CODEC_WAIT_US);
                if (index >= 0) {
                    return index;
                }
                drain(false);
            }
            throw new IOException("Timed out waiting for an encoder input buffer");
        }

        private void queueEndOfStream() throws IOException, Cancelled {
            int index = inputIndex();
            prepared.closeFirstImage();
            long ptsUs = lastInputPtsUs + Math.max(1L, 1_000_000L / fps);
            prepared.codec.queueInputBuffer(index, 0, 0, ptsUs,
                    MediaCodec.BUFFER_FLAG_END_OF_STREAM);
        }

        private void drain(boolean waitForEnd) throws IOException, Cancelled {
            MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
            long deadline = SystemClock.elapsedRealtime() + STALL_TIMEOUT_MS;
            while (true) {
                checkCancelled();
                int index = prepared.codec.dequeueOutputBuffer(bufferInfo,
                        waitForEnd ? CODEC_WAIT_US : 0L);
                if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
                    if (!waitForEnd) {
                        return;
                    }
                    if (SystemClock.elapsedRealtime() >= deadline) {
                        throw new IOException("Timed out finalizing H.264 stream");
                    }
                    continue;
                }
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (muxerStarted) {
                        throw new IOException("Encoder changed its output format twice");
                    }
                    MediaFormat outputFormat = prepared.codec.getOutputFormat();
                    if (prepared.encodedHeight != HEIGHT) {
                        outputFormat.setInteger(MediaFormat.KEY_CROP_LEFT, 0);
                        outputFormat.setInteger(MediaFormat.KEY_CROP_TOP, 0);
                        outputFormat.setInteger(MediaFormat.KEY_CROP_RIGHT, WIDTH - 1);
                        outputFormat.setInteger(MediaFormat.KEY_CROP_BOTTOM, HEIGHT - 1);
                    }
                    trackIndex = muxer.addTrack(outputFormat);
                    muxer.start();
                    muxerStarted = true;
                    continue;
                }
                if (index < 0) {
                    continue;
                }

                boolean ended = (bufferInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                if (bufferInfo.size > 0
                        && (bufferInfo.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                    if (!muxerStarted) {
                        prepared.codec.releaseOutputBuffer(index, false);
                        throw new IOException("Video sample arrived before muxer format");
                    }
                    ByteBuffer data = prepared.codec.getOutputBuffer(index);
                    if (data == null) {
                        prepared.codec.releaseOutputBuffer(index, false);
                        throw new IOException("Encoder returned a null output buffer");
                    }
                    if (lastMuxedPtsUs >= 0L && bufferInfo.presentationTimeUs <= lastMuxedPtsUs) {
                        bufferInfo.presentationTimeUs = lastMuxedPtsUs + 1L;
                    }
                    data.position(bufferInfo.offset);
                    data.limit(bufferInfo.offset + bufferInfo.size);
                    muxer.writeSampleData(trackIndex, data, bufferInfo);
                    lastMuxedPtsUs = bufferInfo.presentationTimeUs;
                    outputSamples++;
                }
                prepared.codec.releaseOutputBuffer(index, false);
                if (ended) {
                    return;
                }
            }
        }
    }

    private static boolean supportsMime(MediaCodecInfo info) {
        for (String type : info.getSupportedTypes()) {
            if (MIME.equalsIgnoreCase(type)) {
                return true;
            }
        }
        return false;
    }

    private static boolean supportsColor(int[] colors, int wanted) {
        for (int color : colors) {
            if (color == wanted) {
                return true;
            }
        }
        return false;
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private static int yValue(int r, int g, int b) {
        return clamp(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16);
    }

    private static int uValue(int r, int g, int b) {
        return clamp(((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128);
    }

    private static int vValue(int r, int g, int b) {
        return clamp(((112 * r - 94 * g - 18 * b + 128) >> 8) + 128);
    }

    private static int pixel(int x, int y) {
        return (Math.min(y, HEIGHT - 1) * WIDTH + x) * 4;
    }

    private static void writeFlexible(byte[] rgba, Image image, int encodedHeight)
            throws IOException {
        Image.Plane[] planes = image.getPlanes();
        if (planes.length != 3 || image.getWidth() < WIDTH || image.getHeight() < encodedHeight) {
            throw new IOException("Unexpected flexible YUV image layout");
        }
        ByteBuffer yPlane = planes[0].getBuffer();
        ByteBuffer uPlane = planes[1].getBuffer();
        ByteBuffer vPlane = planes[2].getBuffer();
        int yStride = planes[0].getRowStride();
        int yPixelStride = planes[0].getPixelStride();
        int uStride = planes[1].getRowStride();
        int uPixelStride = planes[1].getPixelStride();
        int vStride = planes[2].getRowStride();
        int vPixelStride = planes[2].getPixelStride();
        for (int y = 0; y < encodedHeight; y++) {
            int source = pixel(0, y);
            int target = y * yStride;
            for (int x = 0; x < WIDTH; x++, source += 4, target += yPixelStride) {
                yPlane.put(target, (byte) yValue(rgba[source] & 255,
                        rgba[source + 1] & 255, rgba[source + 2] & 255));
            }
        }
        for (int y = 0; y < encodedHeight / 2; y++) {
            int uRow = y * uStride;
            int vRow = y * vStride;
            for (int x = 0; x < WIDTH / 2; x++) {
                int p0 = pixel(x * 2, y * 2);
                int p1 = p0 + 4;
                int p2 = pixel(x * 2, y * 2 + 1);
                int p3 = p2 + 4;
                int r = ((rgba[p0] & 255) + (rgba[p1] & 255)
                        + (rgba[p2] & 255) + (rgba[p3] & 255) + 2) / 4;
                int g = ((rgba[p0 + 1] & 255) + (rgba[p1 + 1] & 255)
                        + (rgba[p2 + 1] & 255) + (rgba[p3 + 1] & 255) + 2) / 4;
                int b = ((rgba[p0 + 2] & 255) + (rgba[p1 + 2] & 255)
                        + (rgba[p2 + 2] & 255) + (rgba[p3 + 2] & 255) + 2) / 4;
                uPlane.put(uRow + x * uPixelStride, (byte) uValue(r, g, b));
                vPlane.put(vRow + x * vPixelStride, (byte) vValue(r, g, b));
            }
        }
    }

    private static void writePacked(byte[] rgba, ByteBuffer target, int color,
                                    int encodedHeight, int stride, int sliceHeight) {
        target.clear();
        int ySize = stride * sliceHeight;
        int chromaWidth = WIDTH / 2;
        int chromaHeight = encodedHeight / 2;
        int uStart = ySize;
        int vStart = ySize + stride * sliceHeight / 4;
        boolean planar = color == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar;
        for (int i = 0; i < ySize; i++) {
            target.put(i, (byte) 16);
        }
        for (int i = ySize; i < ySize * 3 / 2; i++) {
            target.put(i, (byte) 128);
        }
        for (int y = 0; y < encodedHeight; y++) {
            int source = pixel(0, y);
            int destination = y * stride;
            for (int x = 0; x < WIDTH; x++, source += 4) {
                target.put(destination + x, (byte) yValue(rgba[source] & 255,
                        rgba[source + 1] & 255, rgba[source + 2] & 255));
            }
        }
        for (int y = 0; y < chromaHeight; y++) {
            for (int x = 0; x < chromaWidth; x++) {
                int p0 = pixel(x * 2, y * 2);
                int p1 = p0 + 4;
                int p2 = pixel(x * 2, y * 2 + 1);
                int p3 = p2 + 4;
                int r = ((rgba[p0] & 255) + (rgba[p1] & 255)
                        + (rgba[p2] & 255) + (rgba[p3] & 255) + 2) / 4;
                int g = ((rgba[p0 + 1] & 255) + (rgba[p1 + 1] & 255)
                        + (rgba[p2 + 1] & 255) + (rgba[p3 + 1] & 255) + 2) / 4;
                int b = ((rgba[p0 + 2] & 255) + (rgba[p1 + 2] & 255)
                        + (rgba[p2 + 2] & 255) + (rgba[p3 + 2] & 255) + 2) / 4;
                if (planar) {
                    target.put(uStart + y * (stride / 2) + x, (byte) uValue(r, g, b));
                    target.put(vStart + y * (stride / 2) + x, (byte) vValue(r, g, b));
                } else {
                    int offset = ySize + y * stride + x * 2;
                    target.put(offset, (byte) uValue(r, g, b));
                    target.put(offset + 1, (byte) vValue(r, g, b));
                }
            }
        }
    }

    private static void notifyEncoded(String id, boolean ok, String path,
                                      long durationMs, String error) {
        try {
            JSONObject message = new JSONObject();
            message.put("id", id);
            message.put("ok", ok);
            message.put("path", path);
            message.put("durationMs", durationMs);
            message.put("error", error == null ? "" : error);
            final String script = "globalThis.fleetingMomentEncoded?.(" + message + ");";
            CocosHelper.runOnGameThread(() -> CocosJavascriptJavaBridge.evalString(script));
        } catch (Throwable callbackError) {
            Log.e(TAG, "Could not deliver MP4 result", callbackError);
        }
    }
}
