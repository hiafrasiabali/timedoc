const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function uploadChunk(serverUrl, token, sessionId, chunkNumber, filePath, startTime, endTime, retryCount = 0) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const fileData = fs.readFileSync(filePath);
    const boundary = '----TimeDOCBoundary' + Date.now();
    const url = new URL('/api/recordings/upload', serverUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Build multipart form data
    const fields = {
      session_id: String(sessionId),
      chunk_number: String(chunkNumber),
      start_time: startTime,
      end_time: endTime,
    };

    let body = '';
    for (const [key, value] of Object.entries(fields)) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${value}\r\n`;
    }

    const fileHeader =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chunk"; filename="chunk_${chunkNumber}.webm"\r\n` +
      `Content-Type: video/webm\r\n\r\n`;

    const fileFooter = `\r\n--${boundary}--\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(body, 'utf-8'),
      Buffer.from(fileHeader, 'utf-8'),
      fileData,
      Buffer.from(fileFooter, 'utf-8'),
    ]);

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
        Authorization: `Bearer ${token}`,
      },
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Delete local file after successful upload
          try {
            fs.unlinkSync(filePath);
          } catch {}
          resolve(JSON.parse(data));
        } else if (retryCount < MAX_RETRIES) {
          console.log(`Upload failed (${res.statusCode}), retrying in ${RETRY_DELAY_MS}ms...`);
          setTimeout(() => {
            uploadChunk(serverUrl, token, sessionId, chunkNumber, filePath, startTime, endTime, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, RETRY_DELAY_MS);
        } else {
          reject(new Error(`Upload failed after ${MAX_RETRIES} retries: HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      if (retryCount < MAX_RETRIES) {
        console.log(`Upload error (${err.message}), retrying in ${RETRY_DELAY_MS}ms...`);
        setTimeout(() => {
          uploadChunk(serverUrl, token, sessionId, chunkNumber, filePath, startTime, endTime, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, RETRY_DELAY_MS);
      } else {
        reject(new Error(`Upload failed after ${MAX_RETRIES} retries: ${err.message}`));
      }
    });

    req.setTimeout(60000, () => {
      req.destroy();
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => {
          uploadChunk(serverUrl, token, sessionId, chunkNumber, filePath, startTime, endTime, retryCount + 1)
            .then(resolve)
            .catch(reject);
        }, RETRY_DELAY_MS);
      } else {
        reject(new Error('Upload timeout after retries'));
      }
    });

    req.write(bodyBuffer);
    req.end();
  });
}

module.exports = { uploadChunk };
