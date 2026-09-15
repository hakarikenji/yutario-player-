/**
 * Minimal, dependency-free ID3 / M4A metadata reader for the
 * My-Device explorer. Parses ID3v2.3/2.4 (and tolerates 2.2) from
 * MP3 files and iTunes-style `ilst` atoms from MP4/M4A.
 */
import type { Track } from "./types";
import { uid } from "./utils";

const decoderFor = (encoding: number): { decode: (b: Uint8Array) => string; bom: number } => {
  if (encoding === 1) return { decode: (b) => decodeUtf16(b, true), bom: 2 };
  if (encoding === 2) return { decode: (b) => decodeUtf16(b, false), bom: 2 };
  if (encoding === 3) return { decode: (b) => new TextDecoder("utf-8").decode(b), bom: 0 };
  return { decode: (b) => new TextDecoder("iso-8859-1").decode(b), bom: 0 };
};

function decodeUtf16(bytes: Uint8Array, leIfNoBom: boolean): string {
  if (bytes.length < 2) return "";
  const bom = (bytes[0] << 8) | bytes[1];
  let le: boolean;
  if (bom === 0xfffe) le = true;
  else if (bom === 0xfeff) le = false;
  else le = leIfNoBom;
  const body = bom === 0xfffe || bom === 0xfeff ? bytes.subarray(2) : bytes;
  return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(body);
}

function syncsafe(buf: DataView, off: number): number {
  return (buf.getUint8(off) << 21) | (buf.getUint8(off + 1) << 14) | (buf.getUint8(off + 2) << 7) | buf.getUint8(off + 3);
}

export interface LocalTrackMeta {
  title: string;
  artist: string;
  album: string;
  artwork?: string; // object URL
  durationSec: number;
}

export async function readAudioMetadata(file: File): Promise<LocalTrackMeta> {
  const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());

  // ID3v2?
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const meta = parseId3v2(head, file);
    if (meta) return meta;
  }

  // MP4/M4A ilst?
  const sig = head.length > 11 ? String.fromCharCode(head[4], head[5], head[6], head[7]) : "";
  if (sig === "ftyp") {
    const meta = parseMp4(head);
    if (meta) return meta;
  }

  // Fallback: derive title from filename.
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const parts = baseName.split(/\s+-\s+/);
  return {
    title: (parts[1] || parts[0] || file.name).trim(),
    artist: parts[1] ? parts[0].trim() : "Local Artist",
    album: "My Device",
    durationSec: 0,
  };
}

function parseId3v2(buf: Uint8Array, file: File): LocalTrackMeta | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const major = view.getUint8(3);
  const size = syncsafe(view, 6);
  let off = 10;
  const end = Math.min(10 + size, buf.length);

  let title = "";
  let artist = "";
  let album = "";
  let artwork: string | undefined;

  const frameHeaderSize = major === 2 ? 6 : 10;

  while (off + frameHeaderSize <= end) {
    let frameId = "";
    let frameSize = 0;
    if (major === 2) {
      frameId = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2]);
      frameSize = (buf[off + 3] << 16) | (buf[off + 4] << 8) | buf[off + 5];
    } else {
      frameId = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      frameSize =
        major === 4 ? syncsafe(view, off + 4) : view.getUint32(off + 4);
    }
    if (frameSize <= 0 || off + frameHeaderSize + frameSize > end) break;

    const body = buf.subarray(off + frameHeaderSize, off + frameHeaderSize + frameSize);

    if (frameId === "TIT2" || frameId === "TT2") {
      title = decodeTextFrame(body);
    } else if (frameId === "TPE1" || frameId === "TP1") {
      artist = decodeTextFrame(body);
    } else if (frameId === "TALB" || frameId === "TAL") {
      album = decodeTextFrame(body);
    } else if ((frameId === "APIC" || frameId === "PIC") && !artwork) {
      try {
        artwork = extractPicture(body);
      } catch {
        /* ignore picture failures */
      }
    }
    off += frameHeaderSize + frameSize;
    if (title && artist && album && artwork) break;
  }

  if (!title && !artist) return null;
  return {
    title: title || file.name.replace(/\.[^.]+$/, ""),
    artist: artist || "Local Artist",
    album: album || "My Device",
    artwork,
    durationSec: 0,
  };
}

function decodeTextFrame(body: Uint8Array): string {
  if (body.length === 0) return "";
  const enc = body[0];
  const { decode } = decoderFor(enc);
  let text = decode(body.subarray(1));
  return text.replace(/\0+$/g, "").trim();
}

function extractPicture(body: Uint8Array): string | undefined {
  // v2.3/2.4 APIC: enc(1) mime(str z) picType(1) description(str z enc) data
  // v2.2 PIC: enc(1) imageFormat(3) picType(1) description(str z enc) data
  let idx = 1;
  let mime = "image/jpeg";
  if (body.length > 4 && body[1] === 0x50 && body[2] === 0x49 && body[3] === 0x43) {
    // v2.2 "PIC" handled by caller frame detection; treat 3-char format
    mime = body[1] === 0x50 ? "image/png" : "image/jpeg";
    idx = 4;
  } else {
    let z = idx;
    while (z < body.length && body[z] !== 0) z++;
    mime = new TextDecoder("iso-8859-1").decode(body.subarray(idx, z)) || "image/jpeg";
    idx = z + 1;
  }
  idx += 1; // picture type
  const enc = body[0];
  if (enc === 1 || enc === 2) {
    while (idx + 1 < body.length && !(body[idx] === 0 && body[idx + 1] === 0)) idx += 2;
    idx += 2;
  } else {
    while (idx < body.length && body[idx] !== 0) idx++;
    idx += 1;
  }
  const data = body.subarray(idx);
  if (data.length < 1024) return undefined;
  const blob = new Blob([data], { type: mime });
  return URL.createObjectURL(blob);
}

function parseMp4(buf: Uint8Array): LocalTrackMeta | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let title = "";
  let artist = "";
  let album = "";
  let artwork: string | undefined;

  const walk = (start: number, end: number, depth: number): void => {
    let off = start;
    while (off + 8 <= end && depth < 8) {
      const size = view.getUint32(off);
      const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
      if (size < 8 || off + size > end) break;
      if (["moov", "udta", "meta", "ilst"].includes(type)) {
        walk(off + (type === "meta" ? 12 : 8), off + size, depth + 1);
      } else if (type === "©nam" || type === "\u00A9nam") {
        title = readIlstData(view, buf, off, size) ?? title;
      } else if (type === "©ART" || type === "\u00A9ART") {
        artist = readIlstData(view, buf, off, size) ?? artist;
      } else if (type === "©alb" || type === "\u00A9alb") {
        album = readIlstData(view, buf, off, size) ?? album;
      } else if (type === "covr") {
        artwork = extractMp4Cover(view, buf, off, size) ?? artwork;
      }
      off += size;
    }
  };

  walk(0, buf.length, 0);
  if (!title && !artist) return null;
  return {
    title: title || "Unknown",
    artist: artist || "Local Artist",
    album: album || "My Device",
    artwork,
    durationSec: 0,
  };
}

function readIlstData(view: DataView, buf: Uint8Array, atomStart: number, atomSize: number): string | null {
  // atom: size(4) '©nam' then 'data' atom: size(4) 'data' type(4) locale(4) payload
  let off = atomStart + 8;
  const end = atomStart + atomSize;
  while (off + 16 <= end) {
    const dataSize = view.getUint32(off);
    const dType = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    if (dType === "data" && dataSize >= 16) {
      const payload = buf.subarray(off + 16, off + dataSize);
      return new TextDecoder("utf-8").decode(payload).replace(/\0/g, "").trim() || null;
    }
    off += dataSize > 0 ? dataSize : 8;
  }
  return null;
}

function extractMp4Cover(view: DataView, buf: Uint8Array, atomStart: number, atomSize: number): string | undefined {
  let off = atomStart + 8;
  const end = atomStart + atomSize;
  while (off + 16 <= end) {
    const dataSize = view.getUint32(off);
    const dType = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    if (dType === "data" && dataSize >= 16) {
      const typeCode = view.getUint32(off + 8) & 0xffffff;
      const mime = typeCode === 14 ? "image/png" : "image/jpeg";
      const payload = buf.subarray(off + 16, off + dataSize);
      if (payload.length < 1024) return undefined;
      const blob = new Blob([payload], { type: mime });
      return URL.createObjectURL(blob);
    }
    off += dataSize > 0 ? dataSize : 8;
  }
  return undefined;
}

/** Build a Track from a File, decoding duration via an off-DOM audio probe. */
export async function fileToTrack(file: File, meta: LocalTrackMeta): Promise<Track> {
  const url = URL.createObjectURL(file);
  let duration = meta.durationSec || 0;
  if (!duration) {
    duration = await probeDuration(url);
  }
  return {
    id: uid("loc"),
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    url,
    artwork: meta.artwork,
    duration,
    source: "local",
    local: true,
    fileName: file.name,
    lyrics: null,
  };
}

export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (d: number) => {
      a.src = "";
      resolve(d);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    a.src = url;
    setTimeout(() => done(0), 8000);
  });
}
