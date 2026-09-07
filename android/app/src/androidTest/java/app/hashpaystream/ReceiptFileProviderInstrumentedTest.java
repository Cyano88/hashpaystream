package app.hashpaystream;

import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ReceiptFileProviderInstrumentedTest {
    @Test public void onlyReceiptCacheFilesCanBeShared() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(context.getCacheDir(), "receipt-exports");
        assertTrue(directory.isDirectory() || directory.mkdirs());
        File receipt = new File(directory, "native-audit-" + UUID.randomUUID() + ".pdf");
        byte[] expected = "%PDF-synthetic-native-audit".getBytes(StandardCharsets.UTF_8);
        try {
            try (FileOutputStream output = new FileOutputStream(receipt)) { output.write(expected); }
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", receipt);
            assertEquals("content", uri.getScheme());
            try (InputStream input = context.getContentResolver().openInputStream(uri)) {
                assertNotNull(input);
                byte[] actual = new byte[expected.length];
                int read = input.read(actual);
                assertEquals(expected.length, read);
                assertArrayEquals(expected, actual);
            }
            try {
                FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", new File(context.getFilesDir(), "not-shareable.pdf"));
                fail("Private app files must not be exposed by the receipt provider");
            } catch (IllegalArgumentException expectedFailure) { /* expected */ }
        } finally { assertTrue(receipt.delete()); }
    }
}
