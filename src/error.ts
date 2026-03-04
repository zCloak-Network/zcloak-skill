/**
 * Unified Error Types for VetKey Operations
 *
 * All VetKey-related errors are instances of ToolError with a specific `code` field
 * that identifies the error category. This enables callers to switch
 * on the error code for structured error handling.
 *
 * Non-VetKey modules in zcloak-agent continue to use standard Error instances.
 */

/** Error codes for categorizing VetKey Tool errors */
export type ErrorCode =
  | "CANISTER_CALL"    // Canister communication failure
  | "ENCRYPTION"       // IBE encryption failure
  | "DECRYPTION"       // IBE or AES decryption failure
  | "IDENTITY"         // PEM identity loading/generation failure
  | "CONFIG"           // Configuration resolution failure
  | "DAEMON"           // Daemon lifecycle error (PID, socket, signal)
  | "IO"               // File system I/O error
  | "RPC_PARSE"        // JSON-RPC protocol parse error
  | "FILE_OP";         // File operation error (size limit, permissions)

/**
 * Unified error class for all VetKey Tool operations.
 *
 * Extends the standard Error class with a `code` field for programmatic
 * error handling, and an optional `cause` for error chaining.
 */
export class ToolError extends Error {
  /** Error category code */
  public readonly code: ErrorCode;

  /** Original cause of this error (for error chaining) */
  public readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.code = code;
    this.name = "ToolError";
    // ES2020 target doesn't support Error(message, options), set cause manually
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

// ============================================================================
// Factory functions for creating typed errors
// ============================================================================

/** Canister call failed (network, consensus, or canister rejection) */
export function canisterCallError(message: string, cause?: unknown): ToolError {
  return new ToolError("CANISTER_CALL", `Canister call failed: ${message}`, { cause });
}

/** Encryption failed (IBE or AES) */
export function encryptionError(message: string, cause?: unknown): ToolError {
  return new ToolError("ENCRYPTION", `Encryption failed: ${message}`, { cause });
}

/** Decryption failed (IBE or AES) */
export function decryptionError(message: string, cause?: unknown): ToolError {
  return new ToolError("DECRYPTION", `${message}`, { cause });
}

/** Identity loading or generation failed */
export function identityError(message: string, cause?: unknown): ToolError {
  return new ToolError("IDENTITY", `Identity error: ${message}`, { cause });
}

/** Configuration resolution failed (missing required fields, etc.) */
export function configError(message: string): ToolError {
  return new ToolError("CONFIG", `Config error: ${message}`);
}

/** Daemon lifecycle error (PID conflicts, socket failures, etc.) */
export function daemonError(message: string, cause?: unknown): ToolError {
  return new ToolError("DAEMON", `Daemon error: ${message}`, { cause });
}

/** File system I/O error */
export function ioError(message: string, cause?: unknown): ToolError {
  return new ToolError("IO", `IO error: ${message}`, { cause });
}

/** JSON-RPC protocol parse error */
export function rpcParseError(message: string, cause?: unknown): ToolError {
  return new ToolError("RPC_PARSE", `RPC parse error: ${message}`, { cause });
}

/** File operation error (size limit exceeded, permissions, etc.) */
export function fileOpError(message: string, cause?: unknown): ToolError {
  return new ToolError("FILE_OP", `File operation error: ${message}`, { cause });
}
