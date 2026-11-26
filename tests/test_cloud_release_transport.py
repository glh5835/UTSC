import hashlib
import io
import stat
from zipfile import ZipFile, ZipInfo

import pytest

from scripts.build_cloudflare_release import unpack_verified_archive


def package(entries=()):
    inventory = b"test inventory\n"
    stream = io.BytesIO()
    with ZipFile(stream, "w") as archive:
        archive.writestr("SHA256SUMS.txt", inventory)
        archive.writestr("bundle.json", b"{}")
        for name, body in entries:
            archive.writestr(name, body)
    data = stream.getvalue()
    return data, {
        "archiveSha256": hashlib.sha256(data).hexdigest(),
        "inventorySha256": hashlib.sha256(inventory).hexdigest(),
    }


def test_exact_transport_inventory_can_be_extracted(tmp_path):
    data, pin = package()
    unpack_verified_archive(data, pin, tmp_path)
    assert (tmp_path / "bundle.json").read_bytes() == b"{}"


@pytest.mark.parametrize("field", ["archiveSha256", "inventorySha256"])
def test_digest_mismatch_refuses_extraction(tmp_path, field):
    data, pin = package()
    pin[field] = "0" * 64
    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        unpack_verified_archive(data, pin, tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("name", ["../escape.json", "dir/file.json", "C:config.json", "raw.txt"])
def test_non_publication_paths_are_refused(tmp_path, name):
    data, pin = package([(name, b"test bytes")])
    with pytest.raises(ValueError, match="flat, regular D7 files"):
        unpack_verified_archive(data, pin, tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_symlink_member_is_refused(tmp_path):
    item = ZipInfo("link.json")
    item.create_system = 3
    item.external_attr = (stat.S_IFLNK | 0o777) << 16
    data, pin = package([(item, b"bundle.json")])
    with pytest.raises(ValueError, match="flat, regular D7 files"):
        unpack_verified_archive(data, pin, tmp_path)
