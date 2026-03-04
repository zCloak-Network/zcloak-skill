/**
 * Tests for serve.ts — JSON-RPC daemon via UDS (Unix Domain Socket)
 *
 * These tests verify:
 * 1. UDS daemon startup and shutdown
 * 2. Encrypt/decrypt inline data via UDS connection
 * 3. Encrypt/decrypt file data via UDS connection
 * 4. Status query
 * 5. Unknown method handling
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createConnection } from 'net';
import { createInterface } from 'readline';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import crypto from 'crypto';
import { KeyStore } from '../key-store';
import { runDaemonUds } from '../serve';
import { socketPath } from '../daemon';

/** Send a JSON-RPC request to a Unix socket and return the response */
function sendRpc(sockPath: string, request: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = createConnection(sockPath);
    let done = false;

    conn.on('connect', () => {
      conn.write(JSON.stringify(request) + '\n');
    });

    const rl = createInterface({ input: conn });

    rl.on('line', (line: string) => {
      if (!done) {
        done = true;
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error(`Invalid JSON: ${line}`));
        }
        conn.end();
      }
    });

    conn.on('error', (err) => {
      if (!done) { done = true; reject(err); }
    });

    setTimeout(() => {
      if (!done) { done = true; conn.destroy(); reject(new Error('Timeout')); }
    }, 5000);
  });
}

/** Wait for a socket to become connectable */
function waitForSocket(sockPath: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const conn = createConnection(sockPath);
      conn.on('connect', () => { conn.end(); resolve(); });
      conn.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Socket not ready'));
        } else {
          setTimeout(tryConnect, 50);
        }
      });
    };
    tryConnect();
  });
}

describe('UDS Daemon', () => {
  const testDerivationId = `test-daemon-${crypto.randomBytes(4).toString('hex')}`;
  let daemonPromise: Promise<void> | null = null;
  let keyStore: KeyStore;

  afterEach(async () => {
    // Shutdown is handled within tests; just ensure cleanup
    if (keyStore) {
      try { keyStore.destroy(); } catch { /* already destroyed */ }
    }
  });

  it('should start, respond to status, and shutdown', async () => {
    keyStore = KeyStore.createForTest(testDerivationId);

    // Start daemon in background
    daemonPromise = runDaemonUds(keyStore, 'test-principal', testDerivationId);

    // Wait for socket to be ready
    const sockPath = socketPath(testDerivationId);
    await waitForSocket(sockPath);

    // Send status request
    const statusResp = await sendRpc(sockPath, { id: 1, method: 'status' });
    expect(statusResp.id).toBe(1);
    expect((statusResp.result as Record<string, unknown>).status).toBe('running');
    expect((statusResp.result as Record<string, unknown>).principal).toBe('test-principal');
    expect((statusResp.result as Record<string, unknown>).mode).toBe('uds');

    // Shutdown
    const shutdownResp = await sendRpc(sockPath, { id: 2, method: 'shutdown' });
    expect(shutdownResp.id).toBe(2);

    // Wait for daemon to fully stop
    await daemonPromise;
  });

  it('should encrypt and decrypt inline data via UDS', async () => {
    const derivId = `test-enc-${crypto.randomBytes(4).toString('hex')}`;
    const ks = KeyStore.createForTest(derivId);

    daemonPromise = runDaemonUds(ks, 'test-principal', derivId);

    const sockPath = socketPath(derivId);
    await waitForSocket(sockPath);

    // Encrypt
    const testData = Buffer.from('Hello, encrypted world!').toString('base64');
    const encResp = await sendRpc(sockPath, {
      id: 1,
      method: 'encrypt',
      params: { data_base64: testData },
    });
    expect(encResp.error).toBeUndefined();
    const encResult = encResp.result as Record<string, unknown>;
    expect(encResult.data_base64).toBeDefined();
    expect(encResult.plaintext_size).toBe(23); // "Hello, encrypted world!" = 23 bytes

    // Decrypt
    const decResp = await sendRpc(sockPath, {
      id: 2,
      method: 'decrypt',
      params: { data_base64: encResult.data_base64 },
    });
    expect(decResp.error).toBeUndefined();
    const decResult = decResp.result as Record<string, unknown>;
    const decrypted = Buffer.from(decResult.data_base64 as string, 'base64').toString('utf-8');
    expect(decrypted).toBe('Hello, encrypted world!');

    // Cleanup
    await sendRpc(sockPath, { id: 99, method: 'shutdown' });
    await daemonPromise;
    keyStore = ks; // for afterEach cleanup
  });

  it('should encrypt and decrypt file data via UDS', async () => {
    const derivId = `test-file-${crypto.randomBytes(4).toString('hex')}`;
    const ks = KeyStore.createForTest(derivId);

    daemonPromise = runDaemonUds(ks, 'test-principal', derivId);

    const sockPath = socketPath(derivId);
    await waitForSocket(sockPath);

    // Write test file
    const inputPath = join(tmpdir(), `vetkey-test-input-${crypto.randomBytes(4).toString('hex')}.txt`);
    const encPath = inputPath + '.enc';
    const outputPath = inputPath + '.dec';
    writeFileSync(inputPath, 'File encryption test content');

    try {
      // Encrypt file
      const encResp = await sendRpc(sockPath, {
        id: 1,
        method: 'encrypt',
        params: { input_file: inputPath, output_file: encPath },
      });
      expect(encResp.error).toBeUndefined();
      expect(existsSync(encPath)).toBe(true);

      // Decrypt file
      const decResp = await sendRpc(sockPath, {
        id: 2,
        method: 'decrypt',
        params: { input_file: encPath, output_file: outputPath },
      });
      expect(decResp.error).toBeUndefined();
      expect(readFileSync(outputPath, 'utf-8')).toBe('File encryption test content');
    } finally {
      // Cleanup files
      for (const f of [inputPath, encPath, outputPath]) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
      await sendRpc(sockPath, { id: 99, method: 'shutdown' });
      await daemonPromise;
      keyStore = ks;
    }
  });

  it('should handle unknown method gracefully', async () => {
    const derivId = `test-unk-${crypto.randomBytes(4).toString('hex')}`;
    const ks = KeyStore.createForTest(derivId);

    daemonPromise = runDaemonUds(ks, 'test-principal', derivId);

    const sockPath = socketPath(derivId);
    await waitForSocket(sockPath);

    const resp = await sendRpc(sockPath, { id: 1, method: 'nonexistent' });
    expect(resp.error).toContain('Unknown method');

    await sendRpc(sockPath, { id: 99, method: 'shutdown' });
    await daemonPromise;
    keyStore = ks;
  });
});
