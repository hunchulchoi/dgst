from __future__ import annotations

import struct
import sys
from pathlib import Path


FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE


class CompoundFile:
    def __init__(self, path: Path):
        self.data = path.read_bytes()
        if self.data[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
            raise ValueError("Not an OLE Compound File")
        self.sector_size = 1 << struct.unpack_from("<H", self.data, 30)[0]
        self.mini_sector_size = 1 << struct.unpack_from("<H", self.data, 32)[0]
        self.first_dir_sector = self.u32(48)
        self.mini_cutoff = self.u32(56)
        self.first_minifat_sector = self.u32(60)
        self.num_minifat_sectors = self.u32(64)
        self.first_difat_sector = self.u32(68)
        self.num_difat_sectors = self.u32(72)

        difat = list(struct.unpack_from("<109I", self.data, 76))
        next_difat = self.first_difat_sector
        for _ in range(self.num_difat_sectors):
            sector = self.sector(next_difat)
            difat.extend(struct.unpack_from(f"<{self.sector_size // 4 - 1}I", sector, 0))
            next_difat = struct.unpack_from("<I", sector, self.sector_size - 4)[0]
        fat_sector_ids = [sid for sid in difat if sid not in (FREESECT, ENDOFCHAIN)]
        self.fat = []
        for sid in fat_sector_ids:
            self.fat.extend(struct.unpack(f"<{self.sector_size // 4}I", self.sector(sid)))

        directory_bytes = self.read_chain(self.first_dir_sector, self.fat)
        self.entries = []
        for offset in range(0, len(directory_bytes), 128):
            entry = directory_bytes[offset : offset + 128]
            if len(entry) < 128:
                break
            name_len = struct.unpack_from("<H", entry, 64)[0]
            name = entry[: max(0, name_len - 2)].decode("utf-16le", errors="replace")
            self.entries.append(
                {
                    "name": name,
                    "type": entry[66],
                    "start": struct.unpack_from("<I", entry, 116)[0],
                    "size": struct.unpack_from("<Q", entry, 120)[0],
                }
            )

        root = next(entry for entry in self.entries if entry["type"] == 5)
        self.ministream = self.read_chain(root["start"], self.fat)[: root["size"]]
        minifat_bytes = self.read_chain(self.first_minifat_sector, self.fat)
        self.minifat = list(
            struct.unpack(
                f"<{len(minifat_bytes) // 4}I",
                minifat_bytes[: (len(minifat_bytes) // 4) * 4],
            )
        )

    def u32(self, offset: int) -> int:
        return struct.unpack_from("<I", self.data, offset)[0]

    def sector(self, sid: int) -> bytes:
        start = (sid + 1) * self.sector_size
        return self.data[start : start + self.sector_size]

    def read_chain(self, start: int, allocation_table: list[int]) -> bytes:
        if start in (FREESECT, ENDOFCHAIN):
            return b""
        out = bytearray()
        sid = start
        visited = set()
        while sid not in (FREESECT, ENDOFCHAIN):
            if sid in visited or sid >= len(allocation_table):
                raise ValueError(f"Broken sector chain at {sid}")
            visited.add(sid)
            out.extend(self.sector(sid))
            sid = allocation_table[sid]
        return bytes(out)

    def read_mini_chain(self, start: int) -> bytes:
        if start in (FREESECT, ENDOFCHAIN):
            return b""
        out = bytearray()
        sid = start
        visited = set()
        while sid not in (FREESECT, ENDOFCHAIN):
            if sid in visited or sid >= len(self.minifat):
                raise ValueError(f"Broken mini-sector chain at {sid}")
            visited.add(sid)
            begin = sid * self.mini_sector_size
            out.extend(self.ministream[begin : begin + self.mini_sector_size])
            sid = self.minifat[sid]
        return bytes(out)

    def stream(self, name: str) -> bytes:
        entry = next(entry for entry in self.entries if entry["name"] == name)
        if entry["size"] < self.mini_cutoff:
            data = self.read_mini_chain(entry["start"])
        else:
            data = self.read_chain(entry["start"], self.fat)
        return data[: entry["size"]]


def main() -> None:
    source = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    cfb = CompoundFile(source)
    for entry in cfb.entries:
        if entry["name"]:
            print(f"{entry['type']:>2} {entry['size']:>8} {entry['name']}")

    preview_text = cfb.stream("PrvText")
    (out_dir / "preview.txt").write_text(
        preview_text.decode("utf-16le", errors="replace").rstrip("\x00"),
        encoding="utf-8",
    )

    preview_image = cfb.stream("PrvImage")
    suffix = ".bmp" if preview_image[:2] == b"BM" else ".bin"
    (out_dir / f"preview{suffix}").write_bytes(preview_image)
    print(f"preview image magic={preview_image[:16].hex()} size={len(preview_image)}")


if __name__ == "__main__":
    main()
