import type { Readable } from "node:stream";

export async function streamToBuffer(
  stream: ReadableStream<Uint8Array> | Readable | null
) {
  if (!stream) return Buffer.from("");
  if (typeof (stream as ReadableStream<Uint8Array>).getReader === "function") {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const result = await reader.read();
      done = result.done ?? false;
      if (result.value) chunks.push(result.value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const readable = stream as Readable;
    readable.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}
